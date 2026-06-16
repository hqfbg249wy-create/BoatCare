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
      // User existiert bereits → er ist sofort im Team (accepted_at gesetzt)
      // und meldet sich mit seinem BESTEHENDEN Passwort an. Wir schicken
      // deshalb KEINE Passwort-Reset-Mail (verwirrend!), sondern eine echte
      // Team-Benachrichtigung über Resend.
      const roleLabel = memberRole === "admin" ? "Admin" : "Mitglied";

      // 1) Bevorzugt: gebrandete Team-Mail über Resend
      let mailSent = await sendTeamNotification(normalizedEmail, provider.name, roleLabel);
      let via = mailSent ? "resend" : "";

      // 2) Fallback: zuverlässiger Magic-Link über Supabase-SMTP (KEIN Passwort-Reset).
      //    signInWithOtp sendet einen Anmelde-Link an bestehende User.
      if (!mailSent) {
        const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
        const { error: otpErr } = await anonClient.auth.signInWithOtp({
          email: normalizedEmail,
          options: { shouldCreateUser: false, emailRedirectTo: "https://provider.skipily.app/" },
        });
        if (!otpErr) { mailSent = true; via = "magiclink"; }
        else console.warn("Magic-Link-Fallback fehlgeschlagen:", otpErr.message);
      }

      return json({
        ok: true,
        mode: "linked-existing",
        mail_via: via,
        message: mailSent
          ? `${normalizedEmail} wurde als ${memberRole} hinzugefügt. Eine Anmelde-Info wurde per E-Mail verschickt — Login mit dem bestehenden Passwort.`
          : `${normalizedEmail} wurde als ${memberRole} hinzugefügt, aber es konnte keine E-Mail versendet werden. Bitte das Team-Mitglied manuell informieren — Login unter provider.skipily.app.`,
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

// Team-Benachrichtigung an einen BEREITS registrierten User (kein Passwort-Reset).
async function sendTeamNotification(email: string, providerName: string, roleLabel: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("RESEND_API_KEY nicht gesetzt — Team-Mail wird übersprungen.");
    return false;
  }
  const portalUrl = "https://provider.skipily.app/";
  const subject = `Du wurdest zum Skipily-Team von ${providerName} hinzugefügt`;
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(11,29,58,0.08)">
          <tr><td style="background:#0B1D3A;padding:24px 32px;text-align:center">
            <div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#fff">SKIPILY</div>
            <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#f97316;text-transform:uppercase;margin-top:4px">Always · Safe · Ready to Sail</div>
          </td></tr>
          <tr><td style="padding:32px">
            <h1 style="margin:0 0 16px;font-size:20px;color:#0B1D3A">Willkommen im Team</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">
              Du wurdest als <strong>${roleLabel}</strong> zum Skipily-Provider-Konto von
              <strong>${providerName}</strong> hinzugefügt. Ihr verwaltet ab jetzt gemeinsam
              Anfragen, Bestellungen und den Shop.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 22px">
              <tr><td align="center" style="border-radius:8px;background:#f97316">
                <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:8px">Zum Provider-Portal</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b">
              Melde Dich einfach mit Deinen <strong>bestehenden Zugangsdaten</strong> an
              (${email}). Es ist <strong>kein neues Passwort nötig</strong>.
            </p>
            <hr style="border:0;border-top:1px solid #e5e7eb;margin:22px 0">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8">
              Du erwartest diese Einladung nicht? Dann ignoriere diese E-Mail einfach.
            </p>
          </td></tr>
          <tr><td style="background:#f8fafc;padding:18px 32px;text-align:center;font-size:12px;color:#94a3b8">
            Skipily · <a href="https://skipily.app" style="color:#94a3b8">skipily.app</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "noreply@skipily.app", to: [email], subject, html }),
    });
    if (!res.ok) { console.warn("Resend Team-Mail fehlgeschlagen:", await res.text()); return false; }
    return true;
  } catch (e) {
    console.warn("Resend Team-Mail Exception:", (e as Error).message);
    return false;
  }
}
