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

    // ── 3) User einladen (schickt Magic-Link-Mail) ──
    const { data: invited, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          is_provider:  true,
          company_name,
          category: category || "repair",
          city:     city     || null,
          country:  "Deutschland",
        },
        redirectTo: "https://provider.skipily.app/",
      });

    if (inviteErr) {
      return json({ error: inviteErr.message }, 400);
    }

    // Der Trigger handle_new_provider_signup legt beim INSERT
    // automatisch die service_providers-Zeile an.

    return json({
      ok: true,
      user_id: invited.user?.id,
      email:   invited.user?.email,
      message: "Einladung per E-Mail gesendet.",
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
