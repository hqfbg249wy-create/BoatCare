// =====================================================================
// redeem-boat-transfer — Kaeufer loest einen Uebergabe-Key ein und erhaelt
// eine eigenstaendige KOPIE des Bootes inkl. gesamter Ausruestung, Fotos,
// Segel-Messblaetter, Tauwerk-Konfigurationen und Wartungshistorie. Der
// Verkaeufer behaelt sein Original unveraendert.
//
// Input:  POST { key }
// Output: { boat_id, boat_name }  (das neue Boot im Konto des Kaeufers)
//
// Laeuft mit Service-Role (Tiefen-Kopie ueber mehrere Tabellen). Der Aufrufer
// muss eingeloggt sein; das neue Boot wird ihm zugeordnet.
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Felder, die beim Klonen generell NICHT uebernommen werden.
const STRIP = new Set(["id", "created_at", "updated_at"]);

function clone(row: Record<string, unknown>, overrides: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRIP.has(k)) continue;
    out[k] = v;
  }
  return { ...out, ...overrides };
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
    const buyerId = userData.user?.id;
    if (!buyerId) return json({ error: "Nicht authentifiziert" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawKey = typeof body?.key === "string" ? body.key.trim().toUpperCase() : "";
    if (!rawKey) return json({ error: "Key fehlt" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Transfer laden + validieren
    const { data: transfer, error: tErr } = await admin
      .from("boat_transfers").select("*").eq("key", rawKey).maybeSingle();
    if (tErr) throw tErr;
    if (!transfer) return json({ error: "Key ungültig" }, 404);
    if (transfer.status !== "active") return json({ error: "Key wurde bereits eingelöst oder ist ungültig" }, 409);
    if (transfer.expires_at && new Date(transfer.expires_at) < new Date()) {
      return json({ error: "Key ist abgelaufen" }, 410);
    }
    if (transfer.created_by === buyerId) {
      return json({ error: "Eigenes Boot kann nicht an sich selbst übergeben werden" }, 400);
    }

    // Quell-Boot laden
    const { data: srcBoat, error: bErr } = await admin
      .from("boats").select("*").eq("id", transfer.boat_id).single();
    if (bErr || !srcBoat) return json({ error: "Quell-Boot nicht gefunden" }, 404);

    // 1) Boot klonen → neuer Eigentuemer. Die Kopie des Kaeufers ist
    //    ausdruecklich NICHT schreibgeschuetzt (frisch nutzbar).
    const { data: newBoat, error: nbErr } = await admin
      .from("boats")
      .insert(clone(srcBoat, { owner_id: buyerId, read_only: false, transferred_at: null }))
      .select("id, name").single();
    if (nbErr) throw nbErr;

    // Vom Verkaeufer behaltene Ausruestung (wird NICHT an den Kaeufer uebertragen).
    const keptSet = new Set<string>(
      Array.isArray(transfer.kept_equipment_ids)
        ? transfer.kept_equipment_ids.map((x: unknown) => String(x))
        : [],
    );

    // 2) Ausruestung klonen (nur NICHT-behaltene Teile; Map alt→neu fuer Kinder)
    const { data: srcEquip } = await admin
      .from("equipment").select("*").eq("boat_id", transfer.boat_id);
    const idMap = new Map<string, string>();
    if (srcEquip && srcEquip.length > 0) {
      for (const eq of srcEquip) {
        if (keptSet.has(String(eq.id))) continue; // behalten → nicht an Kaeufer
        const { data: newEq, error: eqErr } = await admin
          .from("equipment")
          .insert(clone(eq, { boat_id: newBoat.id }))
          .select("id").single();
        if (eqErr) throw eqErr;
        idMap.set(eq.id, newEq.id);
      }

      // 3) Kind-Tabellen klonen (equipment_id neu zuordnen)
      const childTables = [
        "equipment_photos",
        "sail_measurements",
        "rope_configurations",
        "maintenance_history",
      ];
      const oldIds = [...idMap.keys()];
      for (const table of childTables) {
        const { data: rows, error: cErr } = await admin
          .from(table).select("*").in("equipment_id", oldIds);
        if (cErr) {
          // Tabelle evtl. nicht vorhanden → ueberspringen, Kopie nicht abbrechen.
          console.warn(`clone ${table} skipped:`, cErr.message);
          continue;
        }
        if (!rows || rows.length === 0) continue;
        const payload = rows
          .map((r: Record<string, unknown>) => {
            const newEqId = idMap.get(String(r.equipment_id));
            if (!newEqId) return null;
            return clone(r, { equipment_id: newEqId });
          })
          .filter(Boolean);
        if (payload.length > 0) {
          const { error: insErr } = await admin.from(table).insert(payload);
          if (insErr) console.warn(`insert ${table} failed:`, insErr.message);
        }
      }
    }

    // 3b) Behaltene Ausruestung auf ein NEUES, editierbares Boot des Verkaeufers
    //     verschieben (z. B. Mitnahme aufs neue Boot). Kind-Daten folgen ueber
    //     equipment_id automatisch. MUSS vor dem Einfrieren passieren (Trigger
    //     verbietet spaeter Aenderungen an Ausruestung des read_only-Bootes).
    let keptBoatId: string | null = null;
    if (keptSet.size > 0) {
      const sellerId = srcBoat.owner_id;

      // Vom Verkaeufer beim Uebergeben gewaehltes Ziel-Schiff (vorhandenes
      // Schiff hat Vorrang). Es muss dem Verkaeufer gehoeren, nicht read_only
      // und nicht das uebergebene Boot sein.
      if (transfer.kept_target_boat_id) {
        const { data: tb } = await admin
          .from("boats").select("id, owner_id, read_only").eq("id", transfer.kept_target_boat_id).maybeSingle();
        if (tb && tb.owner_id === sellerId && tb.read_only !== true && tb.id !== transfer.boat_id) {
          keptBoatId = tb.id;
        }
      }

      // Sonst ein neues Schiff anlegen: mit dem gewaehlten Namen, oder
      // (Fallback fuer alte Keys) "<Name> (behalten)".
      if (!keptBoatId) {
        const keptName = (typeof transfer.kept_new_boat_name === "string" && transfer.kept_new_boat_name.trim())
          ? transfer.kept_new_boat_name.trim()
          : `${srcBoat.name ?? "Boot"} (${"behalten"})`;
        const { data: keptBoat, error: kbErr } = await admin
          .from("boats")
          .insert(clone(srcBoat, { owner_id: sellerId, read_only: false, transferred_at: null, name: keptName }))
          .select("id").single();
        if (kbErr) throw kbErr;
        keptBoatId = keptBoat.id;
      }

      const { error: mvErr } = await admin.from("equipment")
        .update({ boat_id: keptBoatId })
        .in("id", [...keptSet]);
      if (mvErr) throw mvErr;
    }

    // 4) Original beim Verkaeufer auf den Stand des Verkaufs einfrieren
    //    (read_only). Muss VOR weiteren Edits passieren; der Trigger erlaubt
    //    den Uebergang false -> true.
    const { error: roErr } = await admin.from("boats")
      .update({ read_only: true, transferred_at: new Date().toISOString() })
      .eq("id", transfer.boat_id);
    if (roErr) throw roErr;

    // 5) Transfer als eingeloest markieren
    await admin.from("boat_transfers").update({
      status: "redeemed",
      redeemed_by: buyerId,
      redeemed_at: new Date().toISOString(),
      redeemed_boat_id: newBoat.id,
    }).eq("id", transfer.id);

    return json({
      boat_id: newBoat.id,
      boat_name: newBoat.name,
      equipment_count: idMap.size,
      kept_count: keptSet.size,
      kept_boat_id: keptBoatId,
    });
  } catch (err) {
    console.error("redeem-boat-transfer error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
