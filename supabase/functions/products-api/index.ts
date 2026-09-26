// Public Product REST API
// Allows providers and external integrations to query products
//
// Endpoints:
//   GET  /products-api                → List products (paginated, filterable)
//   GET  /products-api?id=<uuid>      → Get single product
//   POST /products-api                → Create product (requires API key)
//   PUT  /products-api?id=<uuid>      → Update product (requires API key)
//
// Query Parameters:
//   category_id  - Filter by category UUID
//   search       - Full-text search on name
//   boat_type    - Filter by boat type compatibility
//   manufacturer - Filter by manufacturer compatibility
//   provider_id  - Filter by provider UUID
//   in_stock     - Filter by availability (true/false)
//   limit        - Page size (default 20, max 100)
//   offset       - Pagination offset
//   sort         - Sort field (name, price, created_at)
//   order        - Sort direction (asc, desc)
//
// Produktvarianten (z. B. Durchmesser/Groesse/Farbe):
//   - variant_options: Options-Definition am Produkt, Form:
//       [{ "name": "Durchmesser", "values": ["6mm","8mm","10mm"] }]
//   - variants: eine Kombination je Eintrag; ersetzt beim POST/PUT ALLE
//       vorhandenen Varianten des Produkts (leeres Array = Varianten loeschen):
//       [{ "attributes": {"Durchmesser":"8mm"}, "price": 120.0,
//          "stock_quantity": 15, "sku": "LIROS-8", "image_url": null }]
//   POST-Beispiel (Body):
//     {
//       "name": "Liros Race SK78", "price": 100.0, "currency": "EUR",
//       "category_id": "<uuid>",
//       "variant_options": [{"name":"Durchmesser","values":["6mm","8mm"]}],
//       "variants": [
//         {"attributes":{"Durchmesser":"6mm"},"price":100.0,"stock_quantity":20,"sku":"SK78-6"},
//         {"attributes":{"Durchmesser":"8mm"},"price":120.0,"stock_quantity":15,"sku":"SK78-8"}
//       ]
//     }
//   GET liefert product_variants (id, attributes, price, stock_quantity, sku, ...)
//   je Produkt mit zurueck.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);

  try {
    // ── Authentication (optional for reads, required for writes) ──
    let providerId: string | null = null;

    const apiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");

    if (apiKey) {
      // Validate provider API key + Subscription-Tier prüfen (API ist Pro+).
      // Der API-Key liegt in der streng abgesicherten Tabelle provider_secrets.
      const { data: secret, error: secretErr } = await supabase
        .from("provider_secrets")
        .select("provider_id")
        .eq("api_key", apiKey)
        .maybeSingle();

      if (secretErr || !secret) {
        return jsonResponse({ error: "Invalid API key" }, 401);
      }

      const { data: providerData, error: keyErr } = await supabase
        .from("service_providers")
        .select("id, subscription_tier, subscription_status, free_until")
        .eq("id", secret.provider_id)
        .eq("is_shop_active", true)
        .single();

      if (keyErr || !providerData) {
        return jsonResponse({ error: "Invalid API key" }, 401);
      }

      // Tier-Gate: API ist nur für Pro/Enterprise oder Admin-Grants verfügbar
      const tier = providerData.subscription_tier;
      const status = providerData.subscription_status;
      const grantActive = tier === "admin_grant"
        && (providerData.free_until === null || new Date(providerData.free_until) > new Date());
      const paidActive  = tier === "professional" && status === "active";

      if (!grantActive && !paidActive) {
        return jsonResponse({
          error: "API-Zugang ist nur im Pro- oder Enterprise-Tarif verfügbar. Bitte im Provider-Portal upgraden.",
          upgrade_required: true,
        }, 403);
      }
      providerId = providerData.id;
    } else if (authHeader) {
      // Validate Bearer token (Supabase auth)
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser(token);

      if (!authErr && user) {
        // Find provider linked to this user
        const { data: provData } = await supabase
          .from("service_providers")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (provData) providerId = provData.id;
      }
    }

    // ── Route by method ──
    switch (req.method) {
      case "GET":
        return await handleGet(supabase, url);

      case "POST": {
        if (!providerId) return jsonResponse({ error: "Authentication required" }, 401);
        const body = await req.json();
        return await handleCreate(supabase, providerId, body);
      }

      case "PUT": {
        if (!providerId) return jsonResponse({ error: "Authentication required" }, 401);
        const body = await req.json();
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "Product ID required" }, 400);
        return await handleUpdate(supabase, providerId, id, body);
      }

      default:
        return jsonResponse({ error: "Method not allowed" }, 405);
    }
  } catch (error) {
    console.error("Products API error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ── GET: List or single product ──
async function handleGet(supabase: any, url: URL) {
  const id = url.searchParams.get("id");

  const selectFields = `
    id, name, description, manufacturer, part_number, price, currency,
    shipping_cost, delivery_days, in_stock, sku, ean, weight_kg,
    stock_quantity, min_order_quantity, is_active,
    fits_boat_types, fits_manufacturers, compatible_equipment,
    tags, images, variant_options, created_at, updated_at,
    product_categories(id, slug, name_de, name_en),
    service_providers(id, name, city),
    product_variants(id, attributes, price, stock_quantity, in_stock, sku, image_url, is_active, sort_order)
  `;

  // Single product
  if (id) {
    const { data, error } = await supabase
      .from("metashop_products")
      .select(selectFields)
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return jsonResponse({ error: "Product not found" }, 404);
    }

    return jsonResponse({ data });
  }

  // List products with filters
  let query = supabase
    .from("metashop_products")
    .select(selectFields, { count: "exact" })
    .eq("is_active", true);

  // Filters
  const categoryId = url.searchParams.get("category_id");
  if (categoryId) query = query.eq("category_id", categoryId);

  const search = url.searchParams.get("search");
  if (search) query = query.ilike("name", `%${search}%`);

  const boatType = url.searchParams.get("boat_type");
  if (boatType) query = query.contains("fits_boat_types", [boatType]);

  const manufacturer = url.searchParams.get("manufacturer");
  if (manufacturer) query = query.contains("fits_manufacturers", [manufacturer]);

  const provId = url.searchParams.get("provider_id");
  if (provId) query = query.eq("provider_id", provId);

  const inStock = url.searchParams.get("in_stock");
  if (inStock === "true") query = query.eq("in_stock", true);
  if (inStock === "false") query = query.eq("in_stock", false);

  // Sorting
  const sortField = url.searchParams.get("sort") || "created_at";
  const sortOrder = url.searchParams.get("order") || "desc";
  const validSorts = ["name", "price", "created_at", "updated_at"];
  if (validSorts.includes(sortField)) {
    query = query.order(sortField, { ascending: sortOrder === "asc" });
  }

  // Pagination
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Query error:", error);
    return jsonResponse({ error: "Failed to fetch products" }, 500);
  }

  return jsonResponse({
    data,
    pagination: {
      total: count,
      limit,
      offset,
      has_more: (count || 0) > offset + limit,
    },
  });
}

// ── POST: Create product ──
async function handleCreate(supabase: any, providerId: string, body: any) {
  const product = {
    provider_id: providerId,
    name: body.name,
    description: body.description || null,
    manufacturer: body.manufacturer || null,
    part_number: body.part_number || null,
    price: body.price || null,
    currency: body.currency || "EUR",
    shipping_cost: body.shipping_cost ?? null,
    delivery_days: body.delivery_days || null,
    in_stock: body.in_stock ?? true,
    sku: body.sku || null,
    ean: body.ean || null,
    weight_kg: body.weight_kg || null,
    stock_quantity: body.stock_quantity || null,
    min_order_quantity: body.min_order_quantity || 1,
    is_active: body.is_active ?? true,
    fits_boat_types: body.fits_boat_types || null,
    fits_manufacturers: body.fits_manufacturers || null,
    compatible_equipment: body.compatible_equipment || null,
    tags: body.tags || null,
    images: body.images || null,
    category_id: body.category_id || null,
    // Produktvarianten: variant_options ist die Options-Definition (Spalte),
    // die einzelnen Kombinationen kommen in body.variants (separate Tabelle).
    variant_options: body.variant_options || null,
    source: "api",
  };

  if (!product.name) {
    return jsonResponse({ error: "Product name is required" }, 400);
  }

  const { data, error } = await supabase
    .from("metashop_products")
    .insert(product)
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
    return jsonResponse({ error: "Failed to create product: " + error.message }, 400);
  }

  // Varianten anlegen (falls uebergeben).
  const variantErr = await writeVariants(supabase, data.id, body.variants);
  if (variantErr) return jsonResponse({ data, warning: "Produkt angelegt, Varianten-Fehler: " + variantErr }, 201);

  // Log API usage
  await logApiUsage(supabase, providerId, "create_product");

  return jsonResponse({ data }, 201);
}

// Schreibt product_variants fuer ein Produkt (ersetzt vorhandene komplett).
// variants: [{ attributes:{Option:Wert}, price?, stock_quantity?, sku?, image_url?, in_stock?, is_active? }]
async function writeVariants(supabase: any, productId: string, variants: any): Promise<string | null> {
  if (variants === undefined) return null;        // Feld nicht gesendet -> nichts aendern
  if (!Array.isArray(variants)) return "variants muss ein Array sein";
  await supabase.from("product_variants").delete().eq("product_id", productId);
  if (variants.length === 0) return null;
  const rows = variants.map((v: any, i: number) => ({
    product_id: productId,
    attributes: (v && typeof v.attributes === "object" && v.attributes) || {},
    price: v?.price ?? null,
    stock_quantity: v?.stock_quantity ?? null,
    in_stock: v?.in_stock ?? true,
    sku: v?.sku ?? null,
    image_url: v?.image_url ?? null,
    is_active: v?.is_active ?? true,
    sort_order: i,
  }));
  const { error } = await supabase.from("product_variants").insert(rows);
  return error ? error.message : null;
}

// ── PUT: Update product ──
async function handleUpdate(
  supabase: any,
  providerId: string,
  productId: string,
  body: any
) {
  // Verify ownership
  const { data: existing } = await supabase
    .from("metashop_products")
    .select("provider_id")
    .eq("id", productId)
    .single();

  if (!existing || existing.provider_id !== providerId) {
    return jsonResponse({ error: "Product not found or access denied" }, 404);
  }

  // Build update payload (only include provided fields)
  const updates: Record<string, any> = {};
  const allowedFields = [
    "name", "description", "manufacturer", "part_number", "price",
    "currency", "shipping_cost", "delivery_days", "in_stock", "sku",
    "ean", "weight_kg", "stock_quantity", "min_order_quantity",
    "is_active", "fits_boat_types", "fits_manufacturers",
    "compatible_equipment", "tags", "images", "category_id",
    "variant_options",
  ];

  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  // Varianten koennen auch ohne andere Feldaenderung aktualisiert werden.
  if (Object.keys(updates).length === 0 && !("variants" in body)) {
    return jsonResponse({ error: "No fields to update" }, 400);
  }

  let data = null;
  if (Object.keys(updates).length > 0) {
    const res = await supabase
      .from("metashop_products").update(updates).eq("id", productId).select().single();
    if (res.error) {
      console.error("Update error:", res.error);
      return jsonResponse({ error: "Failed to update product: " + res.error.message }, 400);
    }
    data = res.data;
  }

  // Varianten ersetzen, falls im Body enthalten.
  if ("variants" in body) {
    const variantErr = await writeVariants(supabase, productId, body.variants);
    if (variantErr) return jsonResponse({ data, warning: "Varianten-Fehler: " + variantErr });
  }

  // Log API usage
  await logApiUsage(supabase, providerId, "update_product");

  return jsonResponse({ data });
}

// ── Helpers ──
async function logApiUsage(supabase: any, providerId: string, action: string) {
  try {
    await supabase.from("api_usage_logs").insert({
      provider_id: providerId,
      action,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical, silently ignore
  }
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
