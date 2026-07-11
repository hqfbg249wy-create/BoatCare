// Edge Function: provider-welcome-email
//
// Verschickt die Willkommens-/AGB-Bestätigungsmail an einen ServiceProvider,
// sobald dieser die AGB akzeptiert hat (Signup oder spätere Annahme).
// Die Mail enthält den AGB-Link sowie die akzeptierte Version + den Zeitpunkt
// (rechtlicher Nachweis / Audit-Trail).
//
// Aufruf NUR serverseitig durch den DB-Trigger (Migration 105) mit
// Shared-Secret-Header — kein Client-Zugriff.
//
//   POST /functions/v1/provider-welcome-email
//   Header: x-welcome-secret: <WELCOME_EMAIL_SECRET>
//   Body:   { "provider_id": "<uuid>" }
//
// ENV (Supabase → Edge Functions → Secrets):
//   WELCOME_EMAIL_SECRET   → identisch zum Vault-Secret 'welcome_email_secret'
//   RESEND_API_KEY         → bestehender Resend-Key (noreply@skipily.app)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL     = "Skipily <noreply@skipily.app>";
const AGB_URL        = "https://skipily.app/agb";
const PORTAL_URL     = "https://provider.skipily.app/profile";

// 6 App-Sprachen; unbekannt/nicht zuordbar → Englisch.
const SUPPORTED = ["de", "en", "fr", "it", "es", "nl"];
const DATELOC: Record<string, string> = { de: "de-DE", en: "en-GB", fr: "fr-FR", it: "it-IT", es: "es-ES", nl: "nl-NL" };
const L: Record<string, Record<string, string>> = {
  de: { subject:"Willkommen bei Skipily – dein Anbieter-Konto ist aktiv", greet:"Willkommen, {name}! 👋", intro:"Dein Anbieter-Konto bei Skipily ist eingerichtet. Schön, dass du dabei bist.", agbSec:"Vertragsbedingungen (AGB)", verLabel:"Akzeptierte Version", timeLabel:"Zeitpunkt", agbLink:"AGB ansehen & speichern →", nextTitle:"Nächste Schritte", nextBody:"Vervollständige dein Profil und deine Leistungen, damit Bootseigner dich finden.", portalBtn:"Zum Anbieter-Portal", help:"Fragen? Antworte einfach auf diese E-Mail — wir helfen gern.", team:"Dein Skipily-Team", footer:"© Skipily · Service & Produkte für dich und dein Boot" },
  en: { subject:"Welcome to Skipily – your provider account is active", greet:"Welcome, {name}! 👋", intro:"Your Skipily provider account is set up. Great to have you on board.", agbSec:"Terms & Conditions", verLabel:"Accepted version", timeLabel:"Date", agbLink:"View & save the terms →", nextTitle:"Next steps", nextBody:"Complete your profile and services so boat owners can find you.", portalBtn:"Go to the provider portal", help:"Questions? Just reply to this email — we're happy to help.", team:"Your Skipily team", footer:"© Skipily · Service & products for you and your boat" },
  fr: { subject:"Bienvenue chez Skipily – votre compte prestataire est actif", greet:"Bienvenue, {name} ! 👋", intro:"Votre compte prestataire Skipily est configuré. Ravis de vous compter parmi nous.", agbSec:"Conditions générales", verLabel:"Version acceptée", timeLabel:"Date", agbLink:"Voir et enregistrer les CG →", nextTitle:"Prochaines étapes", nextBody:"Complétez votre profil et vos prestations pour que les propriétaires de bateaux vous trouvent.", portalBtn:"Accéder au portail prestataire", help:"Des questions ? Répondez simplement à cet e-mail — avec plaisir.", team:"Votre équipe Skipily", footer:"© Skipily · Services et produits pour vous et votre bateau" },
  it: { subject:"Benvenuto su Skipily – il tuo account fornitore è attivo", greet:"Benvenuto, {name}! 👋", intro:"Il tuo account fornitore Skipily è pronto. Felici di averti con noi.", agbSec:"Termini e condizioni", verLabel:"Versione accettata", timeLabel:"Data", agbLink:"Vedi e salva i termini →", nextTitle:"Prossimi passi", nextBody:"Completa il tuo profilo e i tuoi servizi affinché i proprietari di barche ti trovino.", portalBtn:"Vai al portale fornitori", help:"Domande? Rispondi a questa e-mail — siamo felici di aiutarti.", team:"Il tuo team Skipily", footer:"© Skipily · Servizi e prodotti per te e la tua barca" },
  es: { subject:"Bienvenido a Skipily – tu cuenta de proveedor está activa", greet:"¡Bienvenido, {name}! 👋", intro:"Tu cuenta de proveedor de Skipily está lista. Nos alegra tenerte a bordo.", agbSec:"Términos y condiciones", verLabel:"Versión aceptada", timeLabel:"Fecha", agbLink:"Ver y guardar los términos →", nextTitle:"Próximos pasos", nextBody:"Completa tu perfil y tus servicios para que los propietarios de barcos te encuentren.", portalBtn:"Ir al portal de proveedores", help:"¿Preguntas? Responde a este correo — estaremos encantados de ayudarte.", team:"Tu equipo de Skipily", footer:"© Skipily · Servicios y productos para ti y tu barco" },
  nl: { subject:"Welkom bij Skipily – je aanbiederaccount is actief", greet:"Welkom, {name}! 👋", intro:"Je Skipily-aanbiederaccount staat klaar. Fijn dat je erbij bent.", agbSec:"Algemene voorwaarden", verLabel:"Geaccepteerde versie", timeLabel:"Datum", agbLink:"Voorwaarden bekijken & bewaren →", nextTitle:"Volgende stappen", nextBody:"Vul je profiel en diensten aan zodat booteigenaren je kunnen vinden.", portalBtn:"Naar het aanbiedersportaal", help:"Vragen? Beantwoord gewoon deze e-mail — we helpen je graag.", team:"Je Skipily-team", footer:"© Skipily · Service & producten voor jou en je boot" },
};

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Shared-Secret-Gate: nur der DB-Trigger darf aufrufen.
  const expected = Deno.env.get("WELCOME_EMAIL_SECRET") ?? "";
  const provided = req.headers.get("x-welcome-secret") ?? "";
  if (!expected || provided !== expected) return json({ error: "Forbidden" }, 403);

  try {
    const { provider_id } = await req.json();
    if (!provider_id) return json({ error: "provider_id fehlt" }, 400);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: p, error } = await supabase
      .from("service_providers")
      .select("id, name, email, agb_accepted_version, agb_accepted_at, welcome_email_sent_at, locale")
      .eq("id", provider_id)
      .single();

    if (error || !p) return json({ error: "Provider nicht gefunden" }, 404);
    if (!p.email)      return json({ error: "Provider ohne E-Mail" }, 400);
    if (p.welcome_email_sent_at) return json({ status: "already_sent" }, 200); // Idempotenz

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY nicht gesetzt");

    // Sprache aus Provider-locale; unbekannt/nicht zuordbar → Englisch.
    const lang = (p.locale && SUPPORTED.includes(p.locale)) ? p.locale : "en";
    const tr = L[lang];

    const name    = (p.name && p.name.trim()) ? p.name.trim() : "Skipily";
    const version = p.agb_accepted_version || "—";
    const accAt   = p.agb_accepted_at
      ? new Date(p.agb_accepted_at).toLocaleString(DATELOC[lang], { dateStyle: "long", timeStyle: "short" })
      : "—";
    const greetTxt  = tr.greet.replace("{name}", name);
    const greetHtml = tr.greet.replace("{name}", esc(name));

    const subject = tr.subject;

    const text =
`${greetTxt}

${tr.intro}

${tr.agbSec}
${tr.verLabel}: ${version}
${tr.timeLabel}: ${accAt}
${AGB_URL}

${tr.nextTitle}
${tr.nextBody}
${PORTAL_URL}

${tr.help}

${tr.team}`;

    const html =
`<!doctype html><html><body style="margin:0;background:#eef2f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f2033">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#04101d;border-radius:16px 16px 0 0;padding:26px 28px;text-align:center">
      <div style="font-size:22px;font-weight:800;letter-spacing:.06em;color:#fff">SKIPILY</div>
      <div style="height:3px;width:120px;background:#f2911e;border-radius:2px;margin:10px auto 8px"></div>
      <div style="font-size:11px;letter-spacing:.28em;color:#93a8bd">IMMER · SICHER · SEEKLAR</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:28px;border:1px solid #e2e8f0;border-top:none">
      <h1 style="margin:0 0 6px;font-size:20px">${greetHtml}</h1>
      <p style="margin:0 0 18px;color:#475569;line-height:1.55">${esc(tr.intro)}</p>

      <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 18px">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:8px">${esc(tr.agbSec)}</div>
        <table style="width:100%;font-size:14px;color:#0f2033;border-collapse:collapse">
          <tr><td style="padding:3px 0;color:#64748b">${esc(tr.verLabel)}</td><td style="padding:3px 0;text-align:right;font-weight:600">${esc(version)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b">${esc(tr.timeLabel)}</td><td style="padding:3px 0;text-align:right;font-weight:600">${esc(accAt)}</td></tr>
        </table>
        <a href="${AGB_URL}" style="display:inline-block;margin-top:12px;color:#f2911e;font-weight:700;text-decoration:none;font-size:14px">${esc(tr.agbLink)}</a>
      </div>

      <p style="margin:0 0 8px;font-weight:700">${esc(tr.nextTitle)}</p>
      <p style="margin:0 0 18px;color:#475569;line-height:1.55">${esc(tr.nextBody)}</p>
      <a href="${PORTAL_URL}" style="display:inline-block;background:#f2911e;color:#211200;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px">${esc(tr.portalBtn)}</a>

      <p style="margin:22px 0 0;color:#94a3b8;font-size:13px;line-height:1.5">${esc(tr.help)}</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin:16px 0 0">${esc(tr.footer)}</p>
  </div>
</body></html>`;

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [p.email], subject, text, html }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Resend-Fehler: ${JSON.stringify(data)}`);

    // Idempotenz-Flag setzen (verhindert Doppelversand bei erneutem Trigger).
    await supabase
      .from("service_providers")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", p.id);

    return json({ success: true, email_id: data.id }, 200);
  } catch (err) {
    console.error("provider-welcome-email error:", err);
    return json({ error: (err as Error)?.message ?? String(err) }, 500);
  }
});
