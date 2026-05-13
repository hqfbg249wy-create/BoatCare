// ========================================================================
// invite-existing-provider — Admin-only Edge Function
//
// Verknüpft einen bestehenden Provider-Eintrag (service_providers.id) mit
// einem neuen Auth-Account. Im Gegensatz zu `invite-provider` legt diese
// Function KEINEN neuen service_providers-Datensatz an — sie sucht den
// bestehenden anhand der provider_id, lädt den User per Magic-Link ein und
// trägt die neue user_id nach erfolgreicher Einladung in die existierende
// Zeile ein.
//
// Verwendung: Admin-UI Bearbeiten-Modal → "Zugangsdaten senden"
//
// Body: { provider_id: UUID, email?: string }
//   - provider_id ist Pflicht
//   - email optional: überschreibt die in service_providers gespeicherte Adresse
//     (gleichzeitig wird der Datensatz auf die neue E-Mail aktualisiert)
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
    // ── 1) Authorization prüfen
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "admin") {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    // ── 2) Body
    const body = await req.json().catch(() => ({}));
    const { provider_id, email: emailOverride } = body ?? {};
    if (!provider_id) return json({ error: "provider_id fehlt" }, 400);

    // ── 3) Provider laden
    const { data: provider, error: provErr } = await admin
      .from("service_providers")
      .select("id, name, email, user_id, category, city")
      .eq("id", provider_id)
      .single();

    if (provErr || !provider) {
      return json({ error: "Provider nicht gefunden" }, 404);
    }

    const targetEmail = (emailOverride || provider.email || "").trim().toLowerCase();
    if (!targetEmail) {
      return json({ error: "Keine E-Mail-Adresse beim Provider hinterlegt — bitte zuerst speichern." }, 400);
    }

    // Falls user_id bereits vergeben → wir senden trotzdem einen Recovery-Link,
    // damit der Provider seine Zugangsdaten zurücksetzen kann.
    if (provider.user_id) {
      const { data: pwReset, error: prErr } = await admin.auth.admin.generateLink({
        type:    "recovery",
        email:   targetEmail,
        options: { redirectTo: "https://provider.skipily.app/" },
      });
      if (prErr) {
        return json({ error: "Recovery-Link konnte nicht erstellt werden: " + prErr.message }, 400);
      }
      // Supabase sendet den Recovery-Link automatisch, wenn SMTP konfiguriert ist
      return json({
        ok: true,
        mode: "recovery",
        message: `Recovery-Link an ${targetEmail} gesendet. Der Provider kann sein Passwort neu setzen und sich danach einloggen.`,
        link: pwReset.properties?.action_link,  // nur in Dashboard sichtbar, für Diagnose
      });
    }

    // user_id ist NULL → wir laden neu ein
    // Prüfen ob die E-Mail evtl. schon einem anderen Profil gehört
    const { data: otherProfile } = await admin
      .from("profiles")
      .select("id, role")
      .ilike("email", targetEmail)
      .maybeSingle();

    if (otherProfile) {
      // E-Mail existiert bereits → wir verknüpfen einfach die bestehende user_id
      // mit unserem Provider-Eintrag und schicken einen Recovery-Link.
      const { error: linkErr } = await admin
        .from("service_providers")
        .update({ user_id: otherProfile.id, email: targetEmail })
        .eq("id", provider_id);
      if (linkErr) return json({ error: "Verknüpfung fehlgeschlagen: " + linkErr.message }, 400);

      const { error: prErr } = await admin.auth.admin.generateLink({
        type:    "recovery",
        email:   targetEmail,
        options: { redirectTo: "https://provider.skipily.app/" },
      });
      if (prErr) return json({ error: "Recovery-Link fehlgeschlagen: " + prErr.message }, 400);

      return json({
        ok: true,
        mode: "linked-existing",
        message: `Die E-Mail ${targetEmail} hatte bereits einen Account. Wir haben den Provider damit verknüpft und einen Login-Link verschickt.`,
      });
    }

    // ── Einladung als NEUER User — ohne Provider-Trigger
    // WICHTIG: kein is_provider=true setzen, sonst legt der Trigger einen
    // weiteren service_providers-Eintrag an. Wir verknüpfen manuell hinterher.
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      targetEmail,
      {
        data: {
          existing_provider_id: provider_id,
          company_name: provider.name,
          category:     provider.category || "repair",
          city:         provider.city     || null,
        },
        redirectTo: "https://provider.skipily.app/",
      },
    );

    if (inviteErr || !invited.user) {
      console.error("inviteUserByEmail failed:", inviteErr);
      return json({
        error: "Einladung fehlgeschlagen: " + (inviteErr?.message || "unbekannter Fehler"),
      }, 400);
    }

    // ── Bestehenden Provider-Eintrag mit dem neuen User verknüpfen
    const { error: linkErr } = await admin
      .from("service_providers")
      .update({
        user_id: invited.user.id,
        email:   targetEmail,
      })
      .eq("id", provider_id);

    if (linkErr) {
      // Rollback: User wieder löschen, damit nicht wieder dieselben kryptischen Fehler kommen
      await admin.auth.admin.deleteUser(invited.user.id).catch(() => null);
      return json({ error: "Verknüpfung fehlgeschlagen: " + linkErr.message }, 400);
    }

    return json({
      ok: true,
      mode: "invited",
      user_id: invited.user.id,
      email:   invited.user.email,
      message: `Magic-Link an ${targetEmail} gesendet. Der Provider kann sich damit erstmals einloggen.`,
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
