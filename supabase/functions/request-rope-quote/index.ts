// Edge Function: request-rope-quote
//
// Sendet eine Tauwerk-Angebotsanfrage an ALLE Tauwerk-Anbieter: legt je Anbieter
// eine service_inquiries-Anfrage an (bestehendes Anfrage-/Antwort-System) und
// benachrichtigt ihn per E-Mail. Tauwerk-Anbieter = Provider mit aktiven
// Produkten in den Tauwerk-Kategorien (Tauwerk / Festmacher & Leinen / Fallen &
// Schoten).
//
// Body: { boat_id?: string, subject: string, message: string }
// Auth: Bearer <user-jwt> des Kaeufers (Eigner).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { pushToProvider } from "../_shared/providerPush.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { emailTo } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Tauwerk-Anbieter erkennt man an ihren Leistungen/Kategorie (Segelmacher,
// Rigger, "Laufendes Gut", "Takelage", "Spleiss" ...). Die Shop-Produkte
// (metashop_products) sind ueberwiegend Elektronik und taugen dafuer nicht.
const ROPE_SERVICE_KEYWORDS = [
  "tauwerk", "laufendes gut", "takelage", "rigg", "spleiss", "spleiß",
  "leine", "festmacher", "running rigging", "cordage",
];
const ROPE_CATEGORY_KEYWORDS = ["segelmacher", "takler", "rigger", "sailmaker"];
// Starkes Namens-Signal: dedizierte Tauwerk-Betriebe -> nie ausschliessen.
const ROPE_NAME_STRONG = ["tauwerk", "tauw", "rope", "spleiss", "spleiß", "cordage", "touw"];
// Fachfremd: taucht oft nur wegen falscher Kategorie (z.B. "Rigg" fuer eine
// Kran-/Finanzfirma) auf. Ohne starkes Namens-Signal ausschliessen.
const ROPE_NAME_EXCLUDE = [
  "propeller", "motorservice", "motoren", "kran", "crane", "finance", "finanz",
  "versicherung", "insurance", "makler", "broker", "immobilien", "charter",
  "yachting", "gutachter", "survey",
];

function isRopeProvider(p: { name?: string | null; category?: string | null; services?: unknown }): boolean {
  const name = String(p.name ?? "").toLowerCase();
  const cat = String(p.category ?? "").toLowerCase();
  const services = Array.isArray(p.services) ? (p.services as unknown[]).map((s) => String(s)) : [];
  const hay = [cat, ...services].join(" ").toLowerCase();

  // Echter Tauwerk-Betrieb am Namen -> immer aufnehmen.
  if (ROPE_NAME_STRONG.some((k) => name.includes(k))) return true;

  const matches = ROPE_SERVICE_KEYWORDS.some((k) => hay.includes(k)) ||
    ROPE_CATEGORY_KEYWORDS.some((k) => cat.includes(k));
  if (!matches) return false;

  // Nur ueber (evtl. falsche) Kategorie/Service erfasst -> fachfremde raus.
  if (ROPE_NAME_EXCLUDE.some((x) => (name + " " + cat).includes(x))) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const svc = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { boat_id, subject, message, rope_config } = await req.json();
    if (!subject || !message) return json({ error: "subject und message erforderlich" }, 400);

    // Strukturierte Tauwerk-Kriterien (fuer den Angebots-Builder des Anbieters).
    const cfg = (rope_config && typeof rope_config === "object") ? rope_config : null;

    // Optional: boat_id muss dem Nutzer gehoeren.
    let safeBoatId: string | null = null;
    if (boat_id) {
      const { data: boat } = await svc
        .from("boats").select("id, owner_id").eq("id", boat_id).maybeSingle();
      if (boat && boat.owner_id === user.id) safeBoatId = boat.id;
    }

    // ── Tauwerk-Anbieter finden (ueber Leistungen/Kategorie) ──
    const { data: allProviders } = await svc
      .from("service_providers")
      .select("id, name, email, category, services")
      .limit(10000);
    const providers = (allProviders || []).filter(isRopeProvider);

    if (providers.length === 0) {
      return json({ ok: true, count: 0, note: "Keine Tauwerk-Anbieter gefunden" });
    }

    const buyerName = (await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle())
      .data?.full_name ?? "";

    const subj = String(subject).slice(0, 200);
    const msg = String(message).slice(0, 4000);

    // ── Je Anbieter: Anfrage anlegen + E-Mail ──
    let count = 0;
    for (const p of providers || []) {
      try {
        const { data: insIq } = await svc.from("service_inquiries").insert({
          owner_id: user.id,
          provider_id: p.id,
          boat_id: safeBoatId,
          subject: subj,
          message: msg,
          rope_config: cfg,
          status: "sent",
          sent_at: new Date().toISOString(),
        }).select("id").single();
        const inqId = insIq?.id;
        count++;
        if (p.email) {
          const portal = Deno.env.get("PROVIDER_PORTAL_URL") ?? "https://provider.skipily.app";
          const link = `${portal}/inquiries${inqId ? `?id=${inqId}` : ""}`;
          await emailTo(
            p.email,
            "Angebotsanfrage Tauwerk" + (buyerName ? " von " + buyerName : ""),
            `${msg}\n\nAnfrage im Anbieter-Portal ansehen und beantworten:\n${link}\n\nDein Skipily-Team`,
          );
        }
        // Zusaetzlich Web-Push, falls der Provider Push aktiviert hat.
        if (inqId) {
          const portal = Deno.env.get("PROVIDER_PORTAL_URL") ?? "https://provider.skipily.app";
          await pushToProvider(svc, p.id, {
            title: "Angebotsanfrage Tauwerk",
            body: `${buyerName ? buyerName + ": " : ""}${subj}`.slice(0, 140),
            url: `${portal}/inquiries?id=${inqId}`,
          });
        }
      } catch (e) {
        console.error("request-rope-quote insert failed for", p.id, (e as Error).message);
      }
    }

    return json({ ok: true, count });
  } catch (err) {
    console.error("request-rope-quote FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
