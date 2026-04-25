// ========================================================================
// invite-admin  —  Admin-only Edge Function
//
// Lädt einen weiteren Admin per Magic-Link ein und legt die profiles-Zeile
// mit role='admin' an. Nur bereits eingeloggte Admins dürfen aufrufen.
//
// POST /functions/v1/invite-admin
// Authorization: Bearer <admin_access_token>
// { "email": "...", "full_name": "..." }
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

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ error: "Invalid token" }, 401);
    }

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileErr || profile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { email, full_name } = body ?? {};

    if (!email) {
      return json({ error: "email ist Pflicht" }, 400);
    }

    // Einladen (Magic-Link)
    const { data: invited, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          is_admin:  true,
          full_name: full_name || email.split("@")[0],
        },
        redirectTo: "https://admin.skipily.app/",
      });

    if (inviteErr) {
      return json({ error: inviteErr.message }, 400);
    }

    // profiles-Zeile mit role='admin' anlegen (Trigger setzt role='boat_owner' default)
    const newUserId = invited.user?.id;
    if (newUserId) {
      await admin.from("profiles").upsert({
        id:        newUserId,
        email,
        role:      "admin",
        full_name: full_name || null,
      }, { onConflict: "id" });
    }

    return json({
      ok: true,
      user_id: newUserId,
      email:   invited.user?.email,
      message: "Admin-Einladung per E-Mail gesendet.",
    });
  } catch (err) {
    console.error("invite-admin error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
