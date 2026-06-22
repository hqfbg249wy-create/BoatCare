// ════════════════════════════════════════════════════════════════════
// invite-existing-provider — Admin-only Edge Function
//
// Erzeugt einen Claim-Link für einen bestehenden service_providers-Eintrag
// und versendet ihn entweder
//   • automatisch über CleverReach  (delivery: "cleverreach")
//   • oder gibt den Link nur zurück, damit der Admin im Frontend sein
//     lokales Mailprogramm öffnet                     (delivery: "mailto")
//
// Es wird KEIN Supabase-Auth-Mailversand mehr ausgelöst — weder
// inviteUserByEmail noch generateLink — damit der Provider auf keinen
// Fall eine zweite, automatisch generierte Mail bekommt.
//
// Der eigentliche Account-Anlage-Vorgang läuft erst beim Aufruf von
// /functions/v1/claim-provider durch den Provider selbst (Token +
// Wunsch-Passwort).
//
// POST /functions/v1/invite-existing-provider
//   { "provider_id": "<uuid>",
//     "delivery":   "cleverreach" | "mailto",
//     "email":      "..."                     // optional: Override }
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }   from "../_shared/cors.ts";
import { upsertReceiver } from "../_shared/cleverreach.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROVIDER_PORTAL_BASE = Deno.env.get("PROVIDER_PORTAL_URL")
  ?? "https://provider.skipily.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1) Auth: nur Admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    // ── 2) Body
    const body = await req.json().catch(() => ({}));
    const {
      provider_id,
      email: emailOverride,
      delivery,
    } = body ?? {};

    if (!provider_id) return json({ error: "provider_id fehlt" }, 400);

    const mode: "cleverreach" | "mailto" =
      delivery === "cleverreach" ? "cleverreach" : "mailto";

    // ── 3) Provider laden (Account-Status). claim_token liegt separat in
    //       der streng abgesicherten Tabelle provider_secrets.
    const { data: provider, error: provErr } = await admin
      .from("service_providers")
      .select("id, name, email, user_id, claimed_at, category, city, country")
      .eq("id", provider_id)
      .single();

    if (provErr || !provider) {
      return json({ error: "Provider nicht gefunden" }, 404);
    }

    const targetEmail = (emailOverride || provider.email || "").trim().toLowerCase();
    if (!targetEmail) {
      return json({ error: "Keine E-Mail-Adresse beim Provider hinterlegt — bitte zuerst speichern." }, 400);
    }

    // Wenn die Empfänger-Adresse überschrieben wurde, in der DB nachziehen,
    // damit der spätere claim-provider-Aufruf damit den Auth-User anlegt.
    if (emailOverride && emailOverride.toLowerCase() !== (provider.email || "").toLowerCase()) {
      const { error: updErr } = await admin
        .from("service_providers")
        .update({ email: targetEmail })
        .eq("id", provider_id);
      if (updErr) {
        return json({ error: "E-Mail konnte nicht aktualisiert werden: " + updErr.message }, 400);
      }
      provider.email = targetEmail;
    }

    // ── 4) Bereits beansprucht?
    //    Dann KEIN Claim-Link mehr — das wäre ein zweiter Onboarding-Pfad.
    //    Stattdessen Hinweis an den Admin (für "Passwort vergessen" hat das
    //    Provider-Portal eine eigene /forgot-password-Route).
    if (provider.user_id || provider.claimed_at) {
      return json({
        error:
          "Dieser Provider hat bereits einen Account beansprucht. " +
          "Für einen Passwort-Reset soll er bitte 'Passwort vergessen' " +
          "im Provider-Portal nutzen.",
      }, 409);
    }

    // ── 5) Claim-Token sicherstellen (aus provider_secrets)
    //    Jeder Provider bekommt per DB-Trigger automatisch eine
    //    provider_secrets-Zeile mit Default-claim_token. Falls aus alten
    //    Datensätzen leer: jetzt nachholen (upsert).
    const { data: existingSecret } = await admin
      .from("provider_secrets")
      .select("claim_token")
      .eq("provider_id", provider_id)
      .maybeSingle();

    let claimToken = (existingSecret?.claim_token as string | null) ?? null;
    if (!claimToken) {
      const { data: regen, error: regenErr } = await admin
        .from("provider_secrets")
        .upsert(
          { provider_id, claim_token: crypto.randomUUID() },
          { onConflict: "provider_id" },
        )
        .select("claim_token")
        .single();
      if (regenErr || !regen?.claim_token) {
        return json({ error: "Claim-Token konnte nicht erzeugt werden: " + (regenErr?.message || "unknown") }, 500);
      }
      claimToken = regen.claim_token;
    }

    const claimUrl = `${PROVIDER_PORTAL_BASE}/claim/${claimToken}`;

    // ── 6a) Versand über CleverReach
    if (mode === "cleverreach") {
      const groupId = Deno.env.get("CLEVERREACH_GROUP_PROVIDER_ONBOARDING") ?? "";
      if (!groupId) {
        return json({
          error:
            "CLEVERREACH_GROUP_PROVIDER_ONBOARDING ist nicht gesetzt. " +
            "Bitte in den Supabase Edge Function Secrets eintragen.",
        }, 500);
      }

      try {
        await upsertReceiver(groupId, {
          email: targetEmail,
          source: "Skipily Provider-Onboarding (Admin-Invite)",
          activatedImmediately: true,
          attributes: {
            company:     provider.name      || "",
            city:        provider.city      || "",
            country:     provider.country   || "",
            category:    provider.category  || "",
            claim_link:  claimUrl,
            provider_id: provider.id,
          },
        });
      } catch (e) {
        return json({
          error: "CleverReach-Versand fehlgeschlagen: " + (e as Error).message,
        }, 502);
      }

      return json({
        ok: true,
        mode: "cleverreach",
        email: targetEmail,
        provider_name: provider.name,
        claim_url: claimUrl,   // für Diagnose im Admin sichtbar
        message:
          `Willkommensmail an ${targetEmail} über CleverReach ausgelöst. ` +
          `Der Provider erhält den Link in Kürze.`,
      });
    }

    // ── 6b) Mailto: nur Link zurückgeben, kein Versand
    return json({
      ok: true,
      mode: "mailto",
      email: targetEmail,
      provider_name: provider.name,
      claim_url: claimUrl,
      action_link: claimUrl,   // Kompatibilität zum bisherigen Frontend
      message:
        `Claim-Link erzeugt — bitte im Mailprogramm prüfen und absenden.`,
    });

  } catch (err) {
    console.error("invite-existing-provider error:", err);
    return json({
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
