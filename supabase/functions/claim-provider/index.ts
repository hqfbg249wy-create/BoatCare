// ════════════════════════════════════════════════════════════════════
// claim-provider  —  Oeffentliche Edge Function
//
// Beansprucht ein verwaistes Provider-Profil per Claim-Token und legt
// dabei den Auth-User an. Wird vom Provider-Portal auf /claim/<token>
// aufgerufen, NACHDEM der Provider sein Wunsch-Passwort eingegeben hat.
//
// Ablauf:
//   1. Token gegen service_providers pruefen (server-side, Service-Role)
//   2. Bereits beansprucht? → Fehler
//   3. Auth-User mit der in der DB hinterlegten Provider-E-Mail anlegen
//      (email_confirm: true — kein Double-Opt-In, da Admin-kuratiert)
//      WICHTIG: E-Mail kommt aus der DB, NICHT vom Client. So kann
//      niemand mit dem Token einen Account auf eine fremde Mail setzen.
//   4. user_id + claimed_at am Provider setzen
//   5. Erfolg → Client loggt sich anschliessend normal mit Mail+Passwort ein
//
// POST /functions/v1/claim-provider
//   { "token": "<uuid>", "password": "<min 8 chars>" }
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { token, password } = body ?? {};

    if (!token || typeof token !== "string") {
      return json({ error: "token erforderlich" }, 400);
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return json({ error: "Passwort muss mindestens 8 Zeichen haben" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── 1) Provider per Token finden ──
    const { data: provider, error: pErr } = await admin
      .from("service_providers")
      .select("id, name, email, user_id, claimed_at, claim_token")
      .eq("claim_token", token)
      .maybeSingle();

    if (pErr) {
      return json({ error: "DB-Fehler: " + pErr.message }, 500);
    }
    if (!provider) {
      return json({ error: "Ungültiger oder abgelaufener Link." }, 404);
    }

    // ── 2) Schon beansprucht? ──
    if (provider.user_id) {
      return json({
        error: "Dieses Profil wurde bereits beansprucht. Bitte über die Anmeldung einloggen.",
        already_claimed: true,
      }, 409);
    }

    if (!provider.email || !provider.email.includes("@")) {
      return json({
        error: "Für dieses Profil ist keine gültige E-Mail hinterlegt. Bitte den Skipily-Support kontaktieren.",
      }, 422);
    }

    const email = provider.email.toLowerCase().trim();

    // ── 3) Existiert schon ein Auth-User mit dieser Mail? ──
    //   Falls ja (z.B. Provider hatte sich mal regulaer registriert),
    //   verknuepfen wir nur statt neu anzulegen.
    let userId: string | null = null;

    const { data: existingList } = await admin.auth.admin.listUsers({
      // listUsers hat keinen direkten Filter — wir holen die erste Seite
      // und suchen. Bei kleinen Userzahlen okay; fuer Skalierung spaeter
      // ueber eine eigene Lookup-Tabelle.
      page: 1,
      perPage: 200,
    });
    const existing = existingList?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );

    if (existing) {
      // Passwort des bestehenden Users NICHT ueberschreiben (Sicherheit) —
      // nur verknuepfen. Der Provider muss sich dann mit seinem bekannten
      // Passwort einloggen. Falls vergessen → ForgotPassword-Flow.
      userId = existing.id;
    } else {
      // ── Neuen Auth-User anlegen ──
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Admin-kuratiert, kein Double-Opt-In noetig
        user_metadata: {
          is_provider: true,
          company_name: provider.name,
          claimed_via: "claim_token",
        },
      });
      if (cErr || !created.user) {
        return json({ error: "Account-Erstellung fehlgeschlagen: " + (cErr?.message ?? "unbekannt") }, 400);
      }
      userId = created.user.id;
    }

    // ── 4) Provider-Update vorbereiten: Frühstarter-Aktionen ──
    //
    // 4a) 6 Monate Pro gratis ab Claim:
    //     free_until wird auf NOW + 6 Monate gesetzt. useFeatureAccess
    //     interpretiert free_until > now als Pro-Niveau, ohne
    //     subscription_tier zu beruehren (so faellt der Provider
    //     nach 6 Monaten automatisch auf Standard zurueck — keine
    //     ungewollte Verlaengerung).
    //
    // 4b) 7 % Provision fuer die ersten 100 angebundenen Shops:
    //     Wir zaehlen wieviele Provider bereits claimed_at IS NOT NULL
    //     UND commission_rate <= 7 haben. Sind das weniger als 100,
    //     bekommt dieser Provider auch 7 %. Sonst bleibt 10 % (Default).
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);

    const updateFields: Record<string, unknown> = {
      user_id: userId,
      claimed_at: new Date().toISOString(),
      free_until: sixMonths.toISOString(),
    };

    try {
      const { count: earlyMoverCount } = await admin
        .from("service_providers")
        .select("id", { count: "exact", head: true })
        .not("claimed_at", "is", null)
        .lte("commission_rate", 7);

      if ((earlyMoverCount ?? 0) < 100) {
        updateFields.commission_rate = 7;
      }
    } catch (e) {
      // Wenn der Count fehlschlaegt, lieber kein 7 % vergeben als
      // versehentlich allen. Standard 10 % bleibt.
      console.warn("early-mover-count failed:", (e as Error).message);
    }

    // ── 5) Provider verknuepfen + Fruehstarter-Felder setzen ──
    const { error: uErr } = await admin
      .from("service_providers")
      .update(updateFields)
      .eq("id", provider.id)
      .is("user_id", null); // doppelte Einloesung verhindern (Race)

    if (uErr) {
      return json({ error: "Verknüpfung fehlgeschlagen: " + uErr.message }, 500);
    }

    return json({
      ok: true,
      email,
      provider_name: provider.name,
      existing_account: !!existing,
      free_until: sixMonths.toISOString(),
      commission_rate: updateFields.commission_rate ?? null, // null = bleibt bei Default 10
      early_mover: updateFields.commission_rate === 7,
      message: existing
        ? "Profil verknüpft. Bitte mit deinem bestehenden Passwort einloggen."
        : "Profil beansprucht. Du kannst dich jetzt einloggen.",
    });
  } catch (err) {
    return json({ error: "Serverfehler: " + (err as Error).message }, 500);
  }
});
