// import-products — CSV-Produktimport per Service-Role
//
// Umgeht die RLS-Fragilität beim Bulk-Insert: prüft serverseitig, ob der
// eingeloggte User Owner ODER Team-Mitglied des Providers ist, und fügt die
// Produkte dann mit Service-Role ein.
//
// POST /import-products
//   Authorization: Bearer <user access token>
//   { provider_id, products: [ { name, price, ... } ] }
//
// Antwort: { ok: number, failed: [{ row, error }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

// Erlaubte Spalten in metashop_products (alles andere wird ignoriert)
const ALLOWED = new Set([
  "name", "manufacturer", "part_number", "sku", "ean", "price", "currency",
  "stock_quantity", "description", "category", "category_id", "shipping_cost", "delivery_days",
  "weight_kg", "min_order_quantity", "is_active", "in_stock", "image_url", "source",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // User aus Token
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Ungültiger Token" }, 401);

    const body = await req.json().catch(() => ({}));
    const providerId = body?.provider_id;
    const products = Array.isArray(body?.products) ? body.products : [];
    if (!providerId) return json({ error: "provider_id fehlt" }, 400);
    if (products.length === 0) return json({ error: "Keine Produkte übergeben" }, 400);
    if (products.length > 1000) return json({ error: "Max. 1000 Produkte pro Import" }, 400);

    // ── Berechtigung: Owner ODER Team-Mitglied? (Service-Role, RLS-unabhängig) ──
    const { data: owned } = await admin
      .from("service_providers").select("id").eq("id", providerId).eq("user_id", user.id).maybeSingle();
    let allowed = !!owned;
    if (!allowed) {
      const { data: member } = await admin
        .from("provider_members").select("provider_id").eq("provider_id", providerId).eq("user_id", user.id).maybeSingle();
      allowed = !!member;
    }
    if (!allowed) {
      return json({ error: "Kein Zugriff auf diesen Betrieb (weder Inhaber noch Team-Mitglied)." }, 403);
    }

    // ── Bereinigen + provider_id erzwingen ──
    const rows = products.map((p: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {};
      for (const k of Object.keys(p)) if (ALLOWED.has(k)) clean[k] = p[k];
      clean.provider_id = providerId;       // immer der validierte Provider
      clean.source = clean.source || "csv";
      return clean;
    });

    // ── Upsert: bestehende Artikel AKTUALISIEREN, neue ANLEGEN, nichts löschen ──
    // Match-Key = part_number pro Provider. So kann der Betrieb dieselbe Excel-
    // Liste nachpflegen (Preise/Bestände ändern) und erneut hochladen: bekannte
    // Artikelnummern werden aktualisiert statt gedoppelt, neue kommen dazu. Zeilen
    // OHNE Artikelnummer sind nicht matchbar → immer neu angelegt.
    const { data: existing } = await admin
      .from("metashop_products")
      .select("id, part_number")
      .eq("provider_id", providerId)
      .not("part_number", "is", null);
    const idByPart = new Map<string, string>();
    for (const r of (existing || []) as Array<Record<string, unknown>>) {
      const pn = String(r.part_number ?? "").trim().toLowerCase();
      if (pn && !idByPart.has(pn)) idByPart.set(pn, String(r.id));
    }

    // Beim UPDATE nur gelieferte, nicht-leere Felder setzen (0/false bleiben
    // gültige Werte) — so leert ein sparsam gefülltes Sheet keine Bestandsdaten.
    const updateFields = (r: Record<string, unknown>): Record<string, unknown> => {
      const u: Record<string, unknown> = {};
      for (const k of Object.keys(r)) {
        if (k === "provider_id") continue;
        const v = r[k];
        if (v === null || v === undefined || v === "") continue;
        u[k] = v;
      }
      return u;
    };

    const toInsert: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ id: string; fields: Record<string, unknown>; row: number }> = [];
    const seenInFile = new Map<string, number>();   // pn → toUpdate-Index (Datei-interne Doubletten mergen)
    rows.forEach((r, idx) => {
      const pn = r.part_number ? String(r.part_number).trim().toLowerCase() : "";
      if (pn && idByPart.has(pn)) {
        // schon in DB → aktualisieren (bei Datei-Doublette gewinnt die letzte Zeile)
        toUpdate.push({ id: idByPart.get(pn)!, fields: updateFields(r), row: idx + 2 });
      } else if (pn && seenInFile.has(pn)) {
        // in der Datei doppelt, aber (noch) nicht in DB → als Update auf die neue ID mergen
        const prev = seenInFile.get(pn)!;
        Object.assign(toInsert[prev], r);
      } else {
        if (pn) seenInFile.set(pn, toInsert.length);
        toInsert.push(r);
      }
    });

    let ok = 0;        // neu angelegt
    let updated = 0;   // aktualisiert
    const failed: Array<{ row: number; error: string }> = [];

    // Inserts (Batch)
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await admin.from("metashop_products").insert(batch);
      if (error) batch.forEach((_, j) => failed.push({ row: i + j + 2, error: error.message }));
      else ok += batch.length;
    }

    // Updates (chunked parallel, damit grosse Kataloge nicht zu langsam werden)
    for (let i = 0; i < toUpdate.length; i += 25) {
      const chunk = toUpdate.slice(i, i + 25);
      const results = await Promise.all(chunk.map(async (u) => {
        if (Object.keys(u.fields).length === 0) return { row: u.row, error: null }; // nichts zu ändern
        const { error } = await admin.from("metashop_products").update(u.fields).eq("id", u.id);
        return { row: u.row, error: error?.message ?? null };
      }));
      for (const r of results) {
        if (r.error) failed.push({ row: r.row, error: r.error });
        else updated++;
      }
    }

    return json({ ok, updated, failed });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
