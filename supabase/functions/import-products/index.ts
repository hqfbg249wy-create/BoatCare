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
  "stock_quantity", "description", "category", "shipping_cost", "delivery_days",
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

    // ── Batch-Insert (Service-Role) ──
    let ok = 0;
    const failed: Array<{ row: number; error: string }> = [];
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await admin.from("metashop_products").insert(batch);
      if (error) batch.forEach((_, j) => failed.push({ row: i + j + 2, error: error.message }));
      else ok += batch.length;
    }

    return json({ ok, failed });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
