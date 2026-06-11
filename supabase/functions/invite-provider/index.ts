// ========================================================================
// invite-provider  —  Admin-only Edge Function
//
// Nutzt den Supabase Service-Role-Key (nur serverseitig!) um einen
// Provider per Magic-Link einzuladen. Durch die user_metadata-Flags
// feuert der on_auth_provider_signup Trigger und legt automatisch
// eine Zeile in service_providers an.
//
// Aufruf aus admin.skipily.app (als authentifizierter Admin):
//   POST /functions/v1/invite-provider
//   Authorization: Bearer <users access_token>
//   { "email": "...", "company_name": "...", "category": "...", "city": "..." }
// ========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1) Authorization prüfen ── nur eingeloggte Admins dürfen einladen
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Token des Aufrufers validieren
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ error: "Invalid token" }, 401);
    }

    // Admin-Rolle prüfen (profiles.role = 'admin')
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileErr || profile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    // ── 2) Body parsen ──
    const body = await req.json().catch(() => ({}));
    const { email, company_name, category, city } = body ?? {};

    if (!email || !company_name) {
      return json({ error: "email und company_name sind Pflicht" }, 400);
    }

    // ── 2.5) Vor-Check: existiert die E-Mail schon irgendwo?
    //   - profiles: andere Rolle (admin, buyer, …)
    //   - service_providers: schon eingeladen / aktiv
    //   Sonst gibt Supabase Auth einen kryptischen "Database error saving new user"
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, role")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      return json({
        error: `Diese E-Mail ist bereits als ${existingProfile.role || "Benutzer"} registriert. Bitte eine andere Adresse verwenden.`,
      }, 409);
    }

    const { data: existingProvider } = await admin
      .from("service_providers")
      .select("id, name, user_id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProvider) {
      return json({
        error: existingProvider.user_id
          ? `Es gibt bereits einen aktiven Provider "${existingProvider.name}" mit dieser E-Mail.`
          : `Es gibt schon einen unverknüpften Provider-Eintrag "${existingProvider.name}" mit dieser E-Mail. Bitte den vorhandenen Eintrag bearbeiten statt neu einzuladen.`,
      }, 409);
    }

    // ── 3) Verwaisten Provider-Eintrag anlegen (KEIN Auth-User!) ──
    //   Vereinheitlichter Claim-Token-Flow: Wir legen nur die
    //   service_providers-Zeile an (ohne user_id). Sie bekommt per
    //   DB-Default automatisch ein claim_token. Der Auth-User entsteht
    //   erst, wenn der Provider den Claim-Link oeffnet und ein Passwort
    //   setzt (Edge Function claim-provider). Das verhindert Karteileichen.
    const { data: inserted, error: insErr } = await admin
      .from("service_providers")
      .insert({
        name:     company_name,
        email:    email.toLowerCase().trim(),
        category: category || "repair",
        city:     city     || null,
        country:  "Deutschland",
      })
      .select("id, claim_token")
      .single();

    if (insErr || !inserted) {
      console.error("provider insert failed:", JSON.stringify(insErr));
      return json({ error: "Anlegen des Provider-Eintrags fehlgeschlagen: " + (insErr?.message ?? "unbekannt") }, 400);
    }

    const claimUrl = `https://provider.skipily.app/claim/${inserted.claim_token}`;

    return json({
      ok: true,
      provider_id: inserted.id,
      email,
      claim_url: claimUrl,
      message: "Provider angelegt. Claim-Link bereit zum Versenden.",
    });
  } catch (err) {
    console.error("invite-provider error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
