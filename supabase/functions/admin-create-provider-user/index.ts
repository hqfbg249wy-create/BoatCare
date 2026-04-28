// ========================================================================
// admin-create-provider-user  —  Admin-only Edge Function
//
// Legt einen Auth-User mit E-Mail und Passwort an und verknüpft ihn mit
// einem existierenden service_providers-Datensatz (setzt user_id). Damit
// können Test-Accounts und solche mit nicht-erreichbaren Mail-Adressen
// (z.B. Fake-Mail) sauber an das Provider-Portal angebunden werden.
//
// POST /functions/v1/admin-create-provider-user
// Authorization: Bearer <admin_access_token>
// {
//   "provider_id":   "uuid",
//   "email":         "owner@example.com",
//   "password":      "min. 8 Zeichen",
//   "mfa_required":  false  // optional, default false
// }
// ========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Caller validieren — muss Admin sein
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "admin") {
      return json({ error: "Forbidden — full admin only" }, 403);
    }

    // 2) Body parsen
    const body = await req.json().catch(() => ({}));
    const { provider_id, email, password, mfa_required } = body ?? {};
    if (!provider_id || !email || !password) {
      return json({ error: "provider_id, email und password sind Pflicht" }, 400);
    }
    if (typeof password !== "string" || password.length < 8) {
      return json({ error: "Passwort muss mindestens 8 Zeichen haben" }, 400);
    }

    // 3) Provider laden + sicherstellen dass er noch keinen User hat
    const { data: provider, error: provErr } = await admin
      .from("service_providers")
      .select("id, name, user_id, email")
      .eq("id", provider_id)
      .single();
    if (provErr || !provider) return json({ error: "Provider nicht gefunden" }, 404);
    if (provider.user_id) {
      return json({
        error: "Provider hat bereits einen Login. Erst entkoppeln (user_id zurücksetzen) oder Passwort-Reset für den existierenden User schicken.",
      }, 409);
    }

    // 4) Auth-User: existiert schon einer mit dieser E-Mail?
    let authUserId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());

    if (found) {
      // Bestehenden Account übernehmen + neues Passwort setzen
      authUserId = found.id;
      const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(found.user_metadata ?? {}),
          is_provider:  true,
          mfa_required: !!mfa_required,
        },
      });
      if (updErr) return json({ error: "updateUserById: " + updErr.message }, 500);
    } else {
      // Neu anlegen
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          is_provider:  true,
          mfa_required: !!mfa_required,
          company_name: provider.name,
        },
      });
      if (createErr || !created.user) {
        return json({ error: "createUser: " + (createErr?.message ?? "unknown") }, 500);
      }
      authUserId = created.user.id;
    }

    // 5) Verknüpfung in service_providers
    const updates: Record<string, unknown> = {
      user_id: authUserId,
      mfa_required: !!mfa_required,
      updated_at: new Date().toISOString(),
    };
    if (!provider.email) updates.email = email; // E-Mail nachtragen falls leer
    const { error: linkErr } = await admin
      .from("service_providers")
      .update(updates)
      .eq("id", provider_id);
    if (linkErr) return json({ error: "Verknüpfung fehlgeschlagen: " + linkErr.message }, 500);

    return json({
      ok: true,
      user_id:      authUserId,
      provider_id,
      email,
      mfa_required: !!mfa_required,
      message:      "Login angelegt und mit Provider verknüpft.",
    });
  } catch (err) {
    console.error("admin-create-provider-user error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
