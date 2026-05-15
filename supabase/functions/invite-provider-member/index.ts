// Edge Function: invite-provider-member
//
// Lädt einen weiteren User zu einem bestehenden Provider-Konto ein
// (Provider-Multi-User für Enterprise-Tier).
//
// Nur der Provider-Owner (= service_providers.user_id) UND nur wenn das
// Abo Enterprise-Level hat (subscription_plan in ent_*, oder Admin-Grant).
//
// Body: { provider_id, email, role?: 'admin'|'member' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const callerId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const { provider_id, email, role } = body ?? {};

    if (!provider_id || !email) {
      return json({ error: "provider_id und email sind Pflicht" }, 400);
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const memberRole = role === "admin" ? "admin" : "member";

    // ── Provider laden + Owner-Check
    const { data: provider, error: provErr } = await admin
      .from("service_providers")
      .select("id, name, user_id, subscription_tier, subscription_plan, subscription_status")
      .eq("id", provider_id)
      .single();

    if (provErr || !provider) return json({ error: "Provider nicht gefunden" }, 404);
    if (provider.user_id !== callerId) {
      return json({ error: "Nur der Provider-Owner darf Mitarbeiter einladen" }, 403);
    }

    // ── Tier-Check: Multi-User nur für Enterprise oder Admin-Grant
    const tier = provider.subscription_tier;
    const plan = provider.subscription_plan;
    const isEnterprisePaid = tier === "professional"
      && (plan === "ent_monthly" || plan === "ent_yearly");
    const isAdminGrant = tier === "admin_grant";

    if (!isEnterprisePaid && !isAdminGrant) {
      return json({
        error: "Multi-User-Verwaltung ist im Enterprise-Tarif enthalten.",
        upgrade_required: true,
      }, 403);
    }

    // ── Selbst-Einladung verhindern
    if (userData.user.email && userData.user.email.toLowerCase() === normalizedEmail) {
      return json({ error: "Du kannst dich nicht selbst als Mitglied einladen." }, 400);
    }

    // ── Existiert User mit dieser E-Mail bereits?
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    // ── Member-Eintrag anlegen / aktualisieren
    const { error: insertErr } = await admin
      .from("provider_members")
      .upsert({
        provider_id,
        email:      normalizedEmail,
        user_id:    existingProfile?.id ?? null,
        role:       memberRole,
        invited_at: new Date().toISOString(),
        invited_by: callerId,
        accepted_at: existingProfile ? new Date().toISOString() : null,
      }, {
        onConflict: "provider_id,email",
      });

    if (insertErr) {
      return json({ error: "Eintrag fehlgeschlagen: " + insertErr.message }, 400);
    }

    // ── Einladungsmail
    if (existingProfile) {
      // User existiert bereits — wir nutzen den anon-Client für resetPasswordForEmail.
      // Wichtig: admin.auth.admin.generateLink() erzeugt NUR den Link, sendet aber
      // KEINE Mail. resetPasswordForEmail (über anon-Key) triggert dagegen den
      // Supabase-Mailversand mit dem konfigurierten "Reset Password"-Template.
      const anonClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      );
      const { error: mailErr } = await anonClient.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: "https://provider.skipily.app/" },
      );
      if (mailErr) {
        console.warn("Recovery-Mail konnte nicht versendet werden:", mailErr);
        return json({
          ok: true,
          mode: "linked-existing",
          message: `${normalizedEmail} wurde als ${memberRole} hinzugefügt, aber die Login-Mail konnte nicht versendet werden: ${mailErr.message}. Bitte das Team-Mitglied manuell informieren — es kann sich mit dem bestehenden Passwort einloggen.`,
        });
      }

      return json({
        ok: true,
        mode: "linked-existing",
        message: `${normalizedEmail} ist bereits registriert und wurde als ${memberRole} hinzugefügt. Login-Link wurde per E-Mail verschickt.`,
      });
    }

    // ── Neuer User → Invite per Magic-Link, accepted_at wird beim ersten Login gesetzt
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: {
          provider_member_id: provider_id,
          provider_name:      provider.name,
        },
        redirectTo: "https://provider.skipily.app/",
      },
    );

    if (inviteErr || !invited.user) {
      console.error("inviteUserByEmail failed:", inviteErr);
      return json({ error: "Einladung fehlgeschlagen: " + (inviteErr?.message || "unbekannt") }, 400);
    }

    // user_id im member-Eintrag nachtragen, accepted_at bleibt NULL bis zum ersten Login
    await admin
      .from("provider_members")
      .update({ user_id: invited.user.id })
      .eq("provider_id", provider_id)
      .eq("email", normalizedEmail);

    return json({
      ok: true,
      mode: "invited",
      user_id: invited.user.id,
      message: `Einladung an ${normalizedEmail} verschickt. Der User wird beim ersten Login automatisch als ${memberRole} verknüpft.`,
    });

  } catch (err) {
    console.error("invite-provider-member error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
