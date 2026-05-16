// Edge Function: import-equipment-csv
//
// Importiert Ausrüstung aus einer CSV-Datei in die equipment-Tabelle.
//
// Verfügbar für: alle User mit aktivem Skipily Plus (jeder Plan).
//   - Plus Individual: für eigene Boote
//   - Plus Family: für das Familien-Boot
//   - Plus Fleet/Enterprise: für eigene Boote oder Fleet-Boote
//
// Boot-CSV-Upload ist NICHT in diesem Endpoint — wird ein eigener
// import-boats-csv für Charter mit ≥10 Booten (erst ab Plus Enterprise/Custom).
//
// CSV-Format (header row pflicht, Trennzeichen wird automatisch erkannt: , oder ;):
//   boat_name,equipment_name,category,manufacturer,model,serial_number,
//   part_number,dimensions,location_on_boat,item_description,notes,
//   installation_date,last_maintenance_date,next_maintenance_date,maintenance_cycle_years
//
// boat_name: muss zu einem der eigenen Boote des Users matchen.
//
// Body: { csv: "<text>", boat_id?: UUID }
//   Wenn boat_id gegeben → alle Equipment-Zeilen kommen auf dieses Boot
//     (boat_name in der CSV wird ignoriert).
//   Sonst → boat_name in CSV bestimmt Boot (case-insensitive, muss eindeutig matchen).
//
// Response: { imported: number, skipped: Array<{row, reason}>, errors: Array<...> }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_CATEGORIES = [
  "navigation", "safety", "engine", "electrical", "rigging",
  "sails", "anchor", "communication", "hvac", "paint", "rope", "other",
];

interface CsvRow {
  boat_name?: string;
  equipment_name?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  part_number?: string;
  dimensions?: string;
  location_on_boat?: string;
  item_description?: string;
  notes?: string;
  installation_date?: string;
  last_maintenance_date?: string;
  next_maintenance_date?: string;
  maintenance_cycle_years?: string;
  [k: string]: string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Ungültiger Token" }, 401);

    // ── Plus-Check: alle Plus-Pläne dürfen CSV-Equipment importieren
    const { data: hasPlus } = await admin.rpc("user_has_plus", {
      p_user_id: user.id,
      p_boat_id: null,
    });
    if (hasPlus !== true) {
      return json({
        error: "CSV-Import ist Skipily Plus vorbehalten.",
        upgrade_hint: "Hole dir Skipily Plus, um Ausrüstungslisten als CSV zu importieren.",
        requires_plus: true,
      }, 402);
    }

    const body = await req.json().catch(() => ({}));
    const csv: string = body?.csv ?? "";
    const explicitBoatId: string | undefined = body?.boat_id;

    if (!csv || csv.trim().length === 0) {
      return json({ error: "CSV-Inhalt fehlt (Feld 'csv')." }, 400);
    }

    // ── CSV parsen
    let rows: CsvRow[];
    try {
      rows = parseCSV(csv);
    } catch (e) {
      return json({ error: "CSV-Parsing fehlgeschlagen: " + (e as Error).message }, 400);
    }
    if (rows.length === 0) {
      return json({ error: "CSV enthält keine Datenzeilen." }, 400);
    }
    if (rows.length > 500) {
      return json({ error: "Max. 500 Zeilen pro Import." }, 400);
    }

    // ── Boote des Users laden — wir importieren nur auf Boote die ihm gehören
    const { data: ownBoats } = await admin
      .from("boats")
      .select("id, name")
      .eq("owner_id", user.id);

    const ownBoatMap = new Map<string, string>();    // name lowercase → id
    const ownBoatIds = new Set<string>();
    for (const b of (ownBoats || [])) {
      if (b.name) ownBoatMap.set(String(b.name).toLowerCase().trim(), b.id);
      ownBoatIds.add(b.id);
    }

    // explicitBoatId muss zu einem eigenen Boot gehören
    if (explicitBoatId && !ownBoatIds.has(explicitBoatId)) {
      return json({ error: "Das angegebene Boot gehört dir nicht." }, 403);
    }

    // ── Pro Zeile: Validieren + INSERT
    let imported = 0;
    const skipped: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      const equipmentName = (r.equipment_name ?? r.name ?? "").trim();
      if (!equipmentName) {
        skipped.push({ row: rowNum, reason: "equipment_name fehlt" });
        continue;
      }

      // Boot ermitteln
      let boatId: string | undefined = explicitBoatId;
      if (!boatId) {
        const csvBoat = (r.boat_name ?? "").trim().toLowerCase();
        if (!csvBoat) {
          skipped.push({ row: rowNum, reason: "boat_name fehlt" });
          continue;
        }
        boatId = ownBoatMap.get(csvBoat);
        if (!boatId) {
          skipped.push({ row: rowNum, reason: `Boot "${r.boat_name}" nicht gefunden (gehört dir nicht oder anderer Name)` });
          continue;
        }
      }

      // Kategorie normalisieren
      let category = (r.category ?? "").trim().toLowerCase();
      if (!VALID_CATEGORIES.includes(category)) category = "other";

      const insertRow: Record<string, unknown> = {
        boat_id: boatId,
        name: equipmentName,
        category,
        manufacturer:        emptyToNull(r.manufacturer),
        model:               emptyToNull(r.model),
        serial_number:       emptyToNull(r.serial_number),
        part_number:         emptyToNull(r.part_number),
        dimensions:          emptyToNull(r.dimensions),
        location_on_boat:    emptyToNull(r.location_on_boat),
        item_description:    emptyToNull(r.item_description),
        notes:               emptyToNull(r.notes),
        installation_date:        parseDate(r.installation_date),
        last_maintenance_date:    parseDate(r.last_maintenance_date),
        next_maintenance_date:    parseDate(r.next_maintenance_date),
        maintenance_cycle_years:  parseInt(r.maintenance_cycle_years ?? "") || null,
      };

      const { error: insErr } = await admin
        .from("equipment")
        .insert(insertRow);

      if (insErr) {
        skipped.push({ row: rowNum, reason: insErr.message });
        continue;
      }
      imported++;
    }

    return json({
      imported,
      skipped,
      total_rows: rows.length,
    });

  } catch (err) {
    console.error("import-equipment-csv error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function parseCSV(input: string): CsvRow[] {
  // BOM entfernen
  let text = input.replace(/^﻿/, "").trim();
  if (!text) return [];

  // Trennzeichen erkennen
  const firstLine = text.split(/\r?\n/)[0];
  const delim = firstLine.includes(";") && firstLine.split(";").length > firstLine.split(",").length
                ? ";" : ",";

  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const header = splitCsvRow(lines[0], delim).map(h => normalizeKey(h));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitCsvRow(lines[i], delim);
    const obj: CsvRow = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j];
      if (!key) continue;
      obj[key] = (cells[j] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

/** Spaltet CSV-Text in physische Zeilen, respektiert doppelt gequotete Newlines. */
function splitCsvLines(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        buf += '""'; i++; continue;
      }
      inQuotes = !inQuotes;
      buf += c;
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

/** Eine CSV-Zeile in Zellen aufteilen, mit Quote-Support. */
function splitCsvRow(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === delim && !inQuotes) {
      out.push(cur); cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function normalizeKey(raw: string): string {
  return raw.toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
}

function emptyToNull(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  // Akzeptiert YYYY-MM-DD oder DD.MM.YYYY oder DD/MM/YYYY
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
