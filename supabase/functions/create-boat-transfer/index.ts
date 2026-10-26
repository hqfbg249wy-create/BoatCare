// =====================================================================
// create-boat-transfer — Verkaeufer erzeugt einen Uebergabe-Key fuer ein Boot.
// Prueft, dass das Boot dem eingeloggten Nutzer gehoert, erzeugt einen
// eindeutigen Key und legt eine boat_transfers-Zeile an (Status 'active').
//
// Input:  POST { boat_id }
// Output: { key, expires_at, boat_name }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkFeature, gateBody, gateLang } from "../_shared/featureGate.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Key ohne mehrdeutige Zeichen (keine 0/O/1/I/L), 3er-Gruppen: SKP-XXXX-XXXX-XXXX
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `SKP-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return json({ error: "Nicht authentifiziert" }, 401);

    const { boat_id, kept_equipment_ids, kept_target_boat_id, kept_new_boat_name, lang, gate_aware } =
      await req.json().catch(() => ({}));
    if (!boat_id) return json({ error: "boat_id fehlt" }, 400);

    // Paywall: Boot per Schluessel uebergeben ist eine Plus-Funktion
    // (Einloesen beim Kaeufer bleibt frei). Erzwungen nur fuer Clients, die den
    // Upsell anzeigen koennen: Web/Provider sowie iOS ab dem Build, der
    // `gate_aware: true` mitschickt. Aeltere iOS-Builds wuerden statt eines
    // Upsells nur einen Fehler zeigen, daher bleiben sie bis dahin ungegatet.
    const platform = req.headers.get("x-skipily-platform");
    if (gate_aware === true || platform !== "ios") {
      const access = await checkFeature(userId, "boat_transfer", gateLang(req, lang));
      if (!access.allowed) return json(gateBody(access), 402);
    }
    const keptIds: string[] = Array.isArray(kept_equipment_ids)
      ? kept_equipment_ids.filter((x) => typeof x === "string")
      : [];
    const targetBoatId: string | null =
      typeof kept_target_boat_id === "string" && kept_target_boat_id.trim() ? kept_target_boat_id.trim() : null;
    const newBoatName: string | null =
      typeof kept_new_boat_name === "string" && kept_new_boat_name.trim() ? kept_new_boat_name.trim().slice(0, 120) : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Eigentum pruefen
    const { data: boat, error: boatErr } = await admin
      .from("boats").select("id, name, owner_id").eq("id", boat_id).single();
    if (boatErr || !boat) return json({ error: "Boot nicht gefunden" }, 404);
    if (boat.owner_id !== userId) return json({ error: "Kein Zugriff auf dieses Boot" }, 403);

    // Eindeutigen Key erzeugen (wenige Kollisions-Retries)
    let key = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = genKey();
      const { data: exists } = await admin
        .from("boat_transfers").select("id").eq("key", candidate).maybeSingle();
      if (!exists) { key = candidate; break; }
    }
    if (!key) return json({ error: "Key konnte nicht erzeugt werden" }, 500);

    // Nur IDs akzeptieren, die wirklich zu diesem Boot gehoeren.
    let validKept: string[] = [];
    if (keptIds.length > 0) {
      const { data: eqRows } = await admin
        .from("equipment").select("id").eq("boat_id", boat_id).in("id", keptIds);
      validKept = (eqRows ?? []).map((r: { id: string }) => r.id);
    }

    // Ziel-Schiff fuer behaltene Ausruestung nur relevant, wenn ueberhaupt
    // etwas behalten wird. Vorhandenes Schiff muss dem Verkaeufer gehoeren und
    // darf nicht das uebergebene Boot selbst sein.
    let validTargetBoatId: string | null = null;
    let validNewBoatName: string | null = null;
    if (validKept.length > 0) {
      if (targetBoatId && targetBoatId !== boat_id) {
        const { data: tb } = await admin
          .from("boats").select("id, owner_id, read_only").eq("id", targetBoatId).maybeSingle();
        if (tb && tb.owner_id === userId && tb.read_only !== true) validTargetBoatId = tb.id;
      }
      if (!validTargetBoatId && newBoatName) validNewBoatName = newBoatName;
    }

    // Neue Ziel-Spalten nur senden, wenn gesetzt — so funktioniert die Funktion
    // auch, falls Migration 191 noch nicht eingespielt ist (alte Transfers).
    const row: Record<string, unknown> = {
      boat_id, key, created_by: userId, kept_equipment_ids: validKept,
    };
    if (validTargetBoatId) row.kept_target_boat_id = validTargetBoatId;
    if (validNewBoatName) row.kept_new_boat_name = validNewBoatName;

    const { data: inserted, error: insErr } = await admin
      .from("boat_transfers")
      .insert(row)
      .select("key, expires_at").single();
    if (insErr) throw insErr;

    return json({ key: inserted.key, expires_at: inserted.expires_at, boat_name: boat.name });
  } catch (err) {
    console.error("create-boat-transfer error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
