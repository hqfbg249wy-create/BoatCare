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

    // ── Match-Klassifikation ────────────────────────────────────────────────
    // Primär Artikelnummer (part_number) → sicherer Auto-Abgleich. Fehlt sie,
    // Fallback auf Name+Hersteller — solche Treffer sind heikel (Bestand könnte
    // versehentlich überschrieben werden) → im preview zur RÜCKFRAGE gemeldet.
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    // deno-lint-ignore no-explicit-any
    const artKey  = (r: any) => { const pn = norm(r.part_number); return pn ? "p:" + pn : ""; };
    // deno-lint-ignore no-explicit-any
    const nameKey = (r: any) => { const n = norm(r.name); return n ? "n:" + n + "|" + norm(r.manufacturer) : ""; };

    const { data: existing } = await admin
      .from("metashop_products")
      .select("id, part_number, name, manufacturer, stock_quantity")
      .eq("provider_id", providerId);
    // deno-lint-ignore no-explicit-any
    const byArt = new Map<string, any>(); const byName = new Map<string, any>();
    for (const e of (existing || []) as Array<Record<string, unknown>>) {
      const a = artKey(e); if (a && !byArt.has(a)) byArt.set(a, e);
      const n = nameKey(e); if (n && !byName.has(n)) byName.set(n, e);
    }
    // deno-lint-ignore no-explicit-any
    const classify = (r: any) => {
      const a = artKey(r);
      if (a && byArt.has(a)) return { status: "article", e: byArt.get(a) };
      if (!a) { const n = nameKey(r); if (n && byName.has(n)) return { status: "name", e: byName.get(n) }; }
      return { status: "new", e: null };
    };

    const mode = body?.mode === "preview" ? "preview" : "commit";

    // ── PREVIEW: nur die Rückfrage-Zeilen (Name-Treffer ohne Artikelnummer) melden
    if (mode === "preview") {
      let cArticle = 0, cNew = 0;
      // deno-lint-ignore no-explicit-any
      const review: any[] = [];
      rows.forEach((r, idx) => {
        const c = classify(r);
        if (c.status === "article") cArticle++;
        else if (c.status === "new") cNew++;
        else review.push({
          index: idx, name: r.name ?? null, manufacturer: r.manufacturer ?? null,
          existingId: c.e.id, existingName: c.e.name,
          existingStock: c.e.stock_quantity ?? null, newStock: r.stock_quantity ?? null,
        });
      });
      return json({ mode: "preview", counts: { article: cArticle, review: review.length, new: cNew }, review });
    }

    // ── COMMIT ────────────────────────────────────────────────────────────────
    // decisions (optional): { "<index>": { action, part_number } }
    //   action (nur für Name-Treffer): update | add_stock | new | skip
    //   part_number: vom Provider im Dialog ergänzte Artikelnummer
    // deno-lint-ignore no-explicit-any
    const decisions: Record<string, any> = (body?.decisions && typeof body.decisions === "object") ? body.decisions : {};
    // deno-lint-ignore no-explicit-any
    const updateFields = (r: any): Record<string, unknown> => {
      const u: Record<string, unknown> = {};
      for (const k of Object.keys(r)) { if (k === "provider_id") continue; const v = r[k]; if (v === null || v === undefined || v === "") continue; u[k] = v; }
      return u;
    };

    let ok = 0, updated = 0, stock = 0, skipped = 0;
    const failed: Array<{ row: number; error: string }> = [];
    // deno-lint-ignore no-explicit-any
    const toInsert: any[] = [];
    const seenInFile = new Map<string, number>();

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const dec = decisions[String(idx)] || {};

      // WICHTIG: erst mit den ORIGINAL-Werten klassifizieren (Ziel bestimmen),
      // DANN eine im Dialog ergänzte Artikelnummer übernehmen — so wird das per
      // Name gematchte Produkt aktualisiert (und bekommt die Artikelnummer),
      // statt als neues Produkt behandelt zu werden.
      const c = classify(r);
      let action: string;
      if (c.status === "article") action = "update";
      else if (c.status === "name") action = ["update","add_stock","new","skip"].includes(dec.action) ? dec.action : "update";
      else action = "new";

      if (dec.part_number && !norm(r.part_number)) r.part_number = String(dec.part_number).trim();

      try {
        if (action === "skip") { skipped++; continue; }
        if (action === "new") {
          const a = artKey(r);
          if (a && seenInFile.has(a)) Object.assign(toInsert[seenInFile.get(a)!], r);
          else { if (a) seenInFile.set(a, toInsert.length); toInsert.push(r); }
          continue;
        }
        const targetId = c.e?.id;
        if (!targetId) { toInsert.push(r); continue; }
        if (action === "add_stock") {
          const cur = Number(c.e.stock_quantity ?? 0);
          const add = Number(r.stock_quantity ?? 0);
          const { error } = await admin.from("metashop_products").update({ stock_quantity: (Number.isFinite(cur)?cur:0) + (Number.isFinite(add)?add:0) }).eq("id", targetId);
          if (error) failed.push({ row: idx + 2, error: error.message }); else stock++;
          continue;
        }
        const fields = updateFields(r);
        if (Object.keys(fields).length === 0) { skipped++; continue; }
        const { error } = await admin.from("metashop_products").update(fields).eq("id", targetId);
        if (error) failed.push({ row: idx + 2, error: error.message }); else updated++;
      } catch (e) { failed.push({ row: idx + 2, error: (e as Error).message }); }
    }

    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await admin.from("metashop_products").insert(batch);
      if (error) batch.forEach((_, j) => failed.push({ row: i + j + 2, error: error.message }));
      else ok += batch.length;
    }

    return json({ ok, updated, stock, skipped, failed });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
