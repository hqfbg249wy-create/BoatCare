// Edge Function: import-equipment-xlsx
//
// Parst EINE Excel-Datei mit drei Blättern (Ausrüstung / Segelmessblatt /
// Tauwerk) und liefert eine Vorschau (mode=preview) bzw. schreibt in die DB
// (mode=commit). Gemeinsame Parser-Quelle für iOS UND (künftig) Web —
// spiegelt die Logik aus owner-portal/src/lib/equipmentImport.js. Wird diese
// geändert, hier nachziehen (Kategorie-/Segel-/Tauwerk-Mapping, Beispielfilter,
// Dedupe).
//
// Body: { file_base64: string, boat_id: string, mode?: "preview" | "commit" }
// Auth: Bearer-JWT (User). Nur eigene Boote. Skipily Plus erforderlich.
//
// Response preview: { equipment:[{name,serial_number,category,dup,reason,matchedName}],
//                     sails:[{equipment,sail_type,linked}], ropes:[{equipment,article_number,linked}],
//                     summary:{...} }
// Response commit:  { summary:{ equipmentNew, equipmentSkipped, sails, ropes, unlinked },
//                     detail:{ equipment:[...], sails:[...], ropes:[...] } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─────────────────────────── Kategorie-Mapping ───────────────────────────
const CATEGORIES = ["engine","electrical","navigation","safety","communication","rigging","hull","deck","anchor","other"];
const CAT_MAP: Record<string,string> = {
  "motor & antrieb":"engine","motor":"engine","engine":"engine","antrieb":"engine",
  "elektrik & batterie":"electrical","elektrik":"electrical","batterie":"electrical","electrical":"electrical",
  "navigation & elektronik":"navigation","navigation":"navigation","elektronik":"navigation",
  "sicherheit":"safety","safety":"safety",
  "kommunikation":"communication","communication":"communication",
  "rigg & takelage":"rigging","rigg":"rigging","takelage":"rigging","rigging":"rigging",
  "rumpf & unterwasser":"hull","rumpf":"hull","hull":"hull",
  "deck & beschläge":"deck","deck":"deck",
  "anker & kette":"anchor","anker":"anchor","anchor":"anchor",
  "sonstiges":"other","other":"other",
};
const FIELD_HEADERS: Record<string,string[]> = {
  name:["bezeichnung","name","gerät","ausrüstung"],
  category:["kategorie","category"],
  manufacturer:["hersteller","manufacturer","marke","brand"],
  model:["modell","model","typ"],
  serial_number:["seriennummer","serial","serial number","sn"],
  part_number:["teilenummer","artikelnummer","part number","part_number","part no","art.-nr."],
  dimensions:["maße","masse","abmessungen","dimensions","größe"],
  location_on_boat:["einbauort","ort","position","location","einbauort am boot"],
  installation_date:["einbaudatum","eingebaut","installation","installationsdatum","installation date"],
  warranty_expiry:["garantie bis","garantie","garantieablauf","gewährleistung","warranty","warranty expiry"],
  maintenance_cycle_years:["wartungsintervall","wartungsintervall (jahre)","intervall","maintenance cycle","cycle years"],
  last_maintenance_date:["letzte wartung","last maintenance","letzte-wartung"],
  item_description:["beschreibung","description","item description"],
  notes:["notizen","notiz","notes","bemerkung"],
};

// ─────────────────────────── Segel/Tauwerk ───────────────────────────
const SAIL_TYPE_MAP: Record<string,string> = {
  "großsegel":"grosssegel","grosssegel":"grosssegel","groß":"grosssegel","gross":"grosssegel",
  "main":"grosssegel","mainsail":"grosssegel","gs":"grosssegel",
  "vorsegel":"vorsegel","genua":"vorsegel","fock":"vorsegel","jib":"vorsegel","headsail":"vorsegel","vs":"vorsegel",
  "gennaker":"gennaker","spinnaker":"gennaker","gennaker/code0":"gennaker","gk":"gennaker",
  "code0":"code0","code 0":"code0","code-0":"code0",
};
type Col = [string, string, string]; // [header, field, type]
const SAIL_COLUMNS: Col[] = [
  ["Ausrüstung","_equipment","text"],["Segeltyp","sail_type","sailtype"],["Segelnummer","sail_number","text"],
  ["Datum","date","date"],["Notizen","notes","text"],
  ["GS P (Vorliek)","gs_p","num"],["GS E (Unterliek)","gs_e","num"],["GS A (Achterliek)","gs_a","num"],
  ["GS G","gs_g","num"],["GS AL","gs_al","num"],["GS Roach unten","gs_rb","num"],["GS Roach oben","gs_ru","num"],
  ["GS Camber unten","gs_cb","num"],["GS Camber oben","gs_cu","num"],
  ["GS Unterliekstau","gs_unterliekstau","text"],["GS Vorliekstau","gs_vorliekstau","text"],
  ["GS Schothornrutscher","gs_schothornrutscher","text"],["GS Mastrutscher","gs_mastrutscher","text"],
  ["GS Einleinenreff","gs_einleinenreff","bool"],["GS Weicher Fußteil","gs_weicher_fussteil","bool"],
  ["GS Loses Unterliek","gs_loses_unterliek","bool"],["GS Segelzeichen","gs_segelzeichen","bool"],
  ["GS Segelnummer aufgedruckt","gs_segelnummer","bool"],["GS Farbe","gs_farbe","text"],
  ["VS I (Vorstag)","vs_i","num"],["VS Vorstagversatz","vs_vst","num"],["VS J","vs_j","num"],
  ["VS Vorliek","vs_vl","num"],["VS W","vs_w","num"],["VS Q","vs_q","num"],["VS K","vs_k","num"],["VS H","vs_h","num"],
  ["VS Reffanlage","vs_reffanlage","text"],["VS Vorliekstau","vs_vorliekstau","text"],
  ["VS Position (BB/STB)","vs_position","text"],["VS Farbe","vs_farbe","text"],
  ["VS Rollreff","vs_rollreff","bool"],["VS Fenster","vs_fenster","bool"],["VS UV-Schutz","vs_uv_schutz","bool"],
  ["GK Vorliek","gk_luff_length","num"],["GK Achterliek","gk_leech_length","num"],["GK Unterliek","gk_foot_length","num"],
  ["GK Mittelbreite","gk_mid_width","num"],["GK Halshöhe","gk_tack_height","num"],
  ["GK Material","gk_material","text"],["GK Farbe","gk_farbe","text"],
];
const ROPE_END_OPTIONS = ["glatt_abgeschnitten","takling","augspleiss_indiv_mit_schamfil","augspleiss_indiv_ohne_schamfil","augspleiss_3_5","augspleiss_6_8","augspleiss_9_12","augspleiss_low_friction","augspleiss_kausch_edelstahl","augspleiss_kausch_verzinkt","augspleiss_zubehoer"];
const ROPE_MATERIALS = ["geschlagen","kern_mantel","squareline","pes_dyneema","dyneema_hohlgeflecht"];
const ROPE_MATERIAL_LABELS: Record<string,string> = { geschlagen:"Geschlagen (3-Schlag)",kern_mantel:"Kern-Mantel",squareline:"Squareline",pes_dyneema:"PES/Dyneema-Mix",dyneema_hohlgeflecht:"Dyneema Hohlgeflecht" };
const ROPE_END_LABELS: Record<string,string> = { glatt_abgeschnitten:"Glatt abgeschnitten",takling:"Takling",augspleiss_indiv_mit_schamfil:"Augspleiß individuell (mit Schamfilschutz)",augspleiss_indiv_ohne_schamfil:"Augspleiß individuell (ohne Schamfilschutz)",augspleiss_3_5:"Augspleiß 3–5 mm",augspleiss_6_8:"Augspleiß 6–8 mm",augspleiss_9_12:"Augspleiß 9–12 mm",augspleiss_low_friction:"Augspleiß Low-Friction-Ring",augspleiss_kausch_edelstahl:"Augspleiß mit Kausch (Edelstahl)",augspleiss_kausch_verzinkt:"Augspleiß mit Kausch (verzinkt)",augspleiss_zubehoer:"Augspleiß mit Zubehör" };
function buildReverse(k2l: Record<string,string>, keys: string[]) {
  const m: Record<string,string> = {};
  for (const k of keys) { m[k]=k; m[k.toLowerCase()]=k; }
  for (const [k,l] of Object.entries(k2l)) m[String(l).trim().toLowerCase()]=k;
  return m;
}
const ROPE_MATERIAL_REV = buildReverse(ROPE_MATERIAL_LABELS, ROPE_MATERIALS);
const ROPE_END_REV = buildReverse(ROPE_END_LABELS, ROPE_END_OPTIONS);
const ROPE_COLUMNS: Col[] = [
  ["Ausrüstung","_equipment","text"],["Artikelnummer","article_number","text"],["Länge (m)","length_m","num"],
  ["Material","material","ropematerial"],["Durchmesser (mm)","diameter_mm","num"],
  ["Ende 1","end1","ropeend"],["Ende 1 Auglänge (cm)","end1_eye_length_cm","num"],
  ["Ende 2","end2","ropeend"],["Ende 2 Auglänge (cm)","end2_eye_length_cm","num"],
  ["Zubehör-Artikelnr.","accessory_article_number","text"],["Notizen","notes","text"],
];

// ─────────────────────────── Beispielzeilen-Filter ───────────────────────────
const normKey = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g," ");
const hasExampleMarker = (v: unknown) => normKey(v).includes("beispiel");
const EXAMPLE_EQUIP = [{ name:"impeller seewasserpumpe", serial:"ym-12345" }];
const EXAMPLE_SAIL  = [{ eq:"großsegel", num:"ger 1234" }];
const EXAMPLE_ROPE  = [{ eq:"großschot", art:"gs-14" }];
// deno-lint-ignore no-explicit-any
const isExampleEquipRow = (r: any) => hasExampleMarker(r.name) || EXAMPLE_EQUIP.some(e => e.name===normKey(r.name) && e.serial===normKey(r.serial_number));
// deno-lint-ignore no-explicit-any
const isExampleSailRow  = (s: any) => hasExampleMarker(s._equipment) || EXAMPLE_SAIL.some(e => e.eq===normKey(s._equipment) && e.num===normKey(s.sail_number));
// deno-lint-ignore no-explicit-any
const isExampleRopeRow  = (r: any) => hasExampleMarker(r._equipment) || EXAMPLE_ROPE.some(e => e.eq===normKey(r._equipment) && e.art===normKey(r.article_number));

// ─────────────────────────── Konvertierung ───────────────────────────
function toISODate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2].padStart(2,"0")}-${de[1].padStart(2,"0")}`;
  const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}
const toNum = (v: unknown) => { if (v==="" || v==null) return null; const n = parseFloat(String(v).replace(",",".")); return Number.isFinite(n) ? n : null; };
const toBool = (v: unknown) => ["ja","x","true","1","yes","wahr","y"].includes(String(v ?? "").trim().toLowerCase());
function convert(v: unknown, type: string): unknown {
  switch (type) {
    case "num": return toNum(v);
    case "bool": return toBool(v);
    case "date": return toISODate(v);
    case "sailtype": return SAIL_TYPE_MAP[String(v ?? "").trim().toLowerCase()] ?? null;
    case "ropematerial": return ROPE_MATERIAL_REV[String(v ?? "").trim().toLowerCase()] ?? null;
    case "ropeend": return ROPE_END_REV[String(v ?? "").trim().toLowerCase()] ?? null;
    default: { const s = String(v ?? "").trim(); return s || null; }
  }
}
function headerToField(h: string): string | null {
  const k = String(h ?? "").trim().toLowerCase();
  for (const [field, vs] of Object.entries(FIELD_HEADERS)) if (vs.includes(k)) return field;
  return null;
}
// deno-lint-ignore no-explicit-any
function mapByColumns(raw: any, cols: Col[]) {
  const byLabel: Record<string,{field:string;type:string}> = {};
  for (const [label, field, type] of cols) byLabel[String(label).trim().toLowerCase()] = { field, type };
  // deno-lint-ignore no-explicit-any
  const item: any = {};
  for (const [k, v] of Object.entries(raw)) {
    const c = byLabel[String(k).trim().toLowerCase()];
    if (c) item[c.field] = convert(v, c.type);
  }
  return item;
}
// deno-lint-ignore no-explicit-any
function mapEquipmentRows(rows: any[]) {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (const raw of rows) {
    // deno-lint-ignore no-explicit-any
    const item: any = {};
    for (const [k, v] of Object.entries(raw)) { const f = headerToField(k); if (f) item[f] = v; }
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const catRaw = String(item.category ?? "").trim().toLowerCase();
    const obj = {
      name,
      category: CAT_MAP[catRaw] ?? (CATEGORIES.includes(catRaw) ? catRaw : "other"),
      manufacturer: String(item.manufacturer ?? "").trim() || null,
      model: String(item.model ?? "").trim() || null,
      serial_number: String(item.serial_number ?? "").trim() || null,
      part_number: String(item.part_number ?? "").trim() || null,
      dimensions: String(item.dimensions ?? "").trim() || null,
      location_on_boat: String(item.location_on_boat ?? "").trim() || null,
      installation_date: toISODate(item.installation_date),
      warranty_expiry: toISODate(item.warranty_expiry),
      maintenance_cycle_years: (() => { const n = parseInt(item.maintenance_cycle_years, 10); return Number.isFinite(n) && n>0 ? n : null; })(),
      last_maintenance_date: toISODate(item.last_maintenance_date),
      item_description: String(item.item_description ?? "").trim() || null,
      notes: String(item.notes ?? "").trim() || null,
    };
    if (isExampleEquipRow(obj)) continue;
    out.push(obj);
  }
  return out;
}
// deno-lint-ignore no-explicit-any
function findSheet(wb: XLSX.WorkBook, names: string[]) {
  const lower = wb.SheetNames.map(n => n.toLowerCase());
  for (const n of names) { const i = lower.indexOf(n); if (i>=0) return wb.SheetNames[i]; }
  for (const n of names) { const i = lower.findIndex(x => x.includes(n)); if (i>=0) return wb.SheetNames[i]; }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Ungültiger Token" }, 401);

    const body = await req.json().catch(() => ({}));
    const fileB64: string = body?.file_base64 ?? "";
    const boatId: string  = body?.boat_id ?? "";
    const mode: string    = body?.mode === "commit" ? "commit" : "preview";
    if (!fileB64) return json({ error: "file_base64 fehlt." }, 400);
    if (!boatId)  return json({ error: "boat_id fehlt." }, 400);

    // ── Boot muss dem User gehören
    const { data: boat } = await admin.from("boats").select("id").eq("id", boatId).eq("owner_id", user.id).maybeSingle();
    if (!boat) return json({ error: "Boot nicht gefunden oder nicht berechtigt." }, 403);

    // ── Plus erforderlich
    const { data: hasPlus } = await admin.rpc("user_has_plus", { p_user_id: user.id, p_boat_id: null });
    if (hasPlus !== true) return json({ error: "Skipily Plus erforderlich.", requires_plus: true }, 402);

    // ── Datei parsen
    let wb: XLSX.WorkBook;
    try {
      const bytes = Uint8Array.from(atob(fileB64), (c) => c.charCodeAt(0));
      wb = XLSX.read(bytes, { type: "array", cellDates: true });
    } catch (_e) {
      return json({ error: "Datei konnte nicht gelesen werden (.xlsx/.csv erwartet)." }, 400);
    }
    // deno-lint-ignore no-explicit-any
    const sheetJson = (names: string[]): any[] => {
      const s = findSheet(wb, names); if (!s) return [];
      return XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: "" });
    };
    const eqRows0 = sheetJson(["ausrüstung","ausruestung","equipment"]);
    const equipment = mapEquipmentRows(eqRows0.length ? eqRows0 : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
    const sails = sheetJson(["segelmessblatt","segel","sail"]).map(r => mapByColumns(r, SAIL_COLUMNS)).filter(s => s._equipment && s.sail_type && !isExampleSailRow(s));
    const ropes = sheetJson(["tauwerk","rope","leine"]).map(r => mapByColumns(r, ROPE_COLUMNS)).filter(r => r._equipment && (r.length_m!=null || r.material || r.diameter_mm!=null || r.article_number) && !isExampleRopeRow(r));

    if (equipment.length > 1000) return json({ error: "Max. 1000 Ausrüstungszeilen pro Import." }, 400);

    // ── Vorhandene Ausrüstung des Boots (Dedupe + Verknüpfung)
    const { data: existing } = await admin.from("equipment").select("id, name, serial_number").eq("boat_id", boatId);
    const bySerial = new Map<string,{id:string;name:string}>();
    const byName   = new Map<string,{id:string;name:string}>();
    for (const e of (existing ?? [])) {
      if (e.serial_number) bySerial.set(normKey(e.serial_number), e);
      byName.set(normKey(e.name), e);
    }
    // deno-lint-ignore no-explicit-any
    const dupInfo = (r: any) => {
      if (r.serial_number && bySerial.has(normKey(r.serial_number))) return { dup: true, reason: "Seriennummer", matchedName: bySerial.get(normKey(r.serial_number))!.name };
      if (byName.has(normKey(r.name))) return { dup: true, reason: "Name", matchedName: byName.get(normKey(r.name))!.name };
      return { dup: false as const };
    };

    // ── PREVIEW
    if (mode === "preview") {
      const eqPrev = equipment.map(r => { const d = dupInfo(r); return { name: r.name, serial_number: r.serial_number, category: r.category, dup: d.dup, reason: d.dup ? d.reason : null, matchedName: d.dup ? d.matchedName : null }; });
      const nameSet = new Set([...byName.keys(), ...equipment.filter(r => !dupInfo(r).dup).map(r => normKey(r.name))]);
      const sailPrev = sails.map(s => ({ equipment: s._equipment, sail_type: s.sail_type, linked: nameSet.has(normKey(s._equipment)) }));
      const ropePrev = ropes.map(r => ({ equipment: r._equipment, article_number: r.article_number, linked: nameSet.has(normKey(r._equipment)) }));
      return json({
        equipment: eqPrev, sails: sailPrev, ropes: ropePrev,
        summary: {
          equipmentNew: eqPrev.filter(e => !e.dup).length,
          equipmentSkipped: eqPrev.filter(e => e.dup).length,
          sails: sailPrev.length, ropes: ropePrev.length,
          unlinked: sailPrev.filter(s => !s.linked).length + ropePrev.filter(r => !r.linked).length,
        },
      });
    }

    // ── COMMIT
    const toInsert = equipment.filter(r => !dupInfo(r).dup);
    if (toInsert.length > 0) {
      const payload = toInsert.map(r => {
        // deno-lint-ignore no-explicit-any
        const p: any = { ...r, boat_id: boatId };
        if (p.maintenance_cycle_years && p.last_maintenance_date) {
          const d = new Date(p.last_maintenance_date); d.setFullYear(d.getFullYear() + p.maintenance_cycle_years);
          p.next_maintenance_date = d.toISOString().slice(0,10);
        }
        return p;
      });
      const { error } = await admin.from("equipment").insert(payload);
      if (error) return json({ error: "Ausrüstung-Insert fehlgeschlagen: " + error.message }, 500);
    }

    // Name -> id (vorhandene + neue)
    const nameToId = new Map<string,string>();
    if (sails.length || ropes.length) {
      const { data: all } = await admin.from("equipment").select("id, name").eq("boat_id", boatId);
      for (const e of (all ?? [])) nameToId.set(normKey(e.name), e.id);
    }
    let sailInserted = 0, sailUnlinked = 0, ropeInserted = 0, ropeUnlinked = 0;
    const sailPayload = [];
    for (const s of sails) { const id = nameToId.get(normKey(s._equipment)); if (!id) { sailUnlinked++; continue; } const { _equipment, ...rest } = s; sailPayload.push({ ...rest, equipment_id: id }); }
    if (sailPayload.length) { const { error } = await admin.from("sail_measurements").insert(sailPayload); if (error) return json({ error: "Segel-Insert fehlgeschlagen: " + error.message }, 500); sailInserted = sailPayload.length; }
    const ropePayload = [];
    for (const r of ropes) { const id = nameToId.get(normKey(r._equipment)); if (!id) { ropeUnlinked++; continue; } const { _equipment, ...rest } = r; ropePayload.push({ ...rest, equipment_id: id, status: "draft" }); }
    if (ropePayload.length) { const { error } = await admin.from("rope_configurations").insert(ropePayload); if (error) return json({ error: "Tauwerk-Insert fehlgeschlagen: " + error.message }, 500); ropeInserted = ropePayload.length; }

    return json({
      summary: {
        equipmentNew: toInsert.length, equipmentSkipped: equipment.length - toInsert.length,
        sails: sailInserted, ropes: ropeInserted, unlinked: sailUnlinked + ropeUnlinked,
      },
    });
  } catch (e) {
    return json({ error: "Unerwarteter Fehler: " + (e as Error).message }, 500);
  }
});
