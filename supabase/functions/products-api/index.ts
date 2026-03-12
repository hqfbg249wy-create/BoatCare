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
      // Validate provider API key
      const { data: providerData, error: keyErr } = await supabase
        .from("service_providers")
        .select("id")
        .eq("api_key", apiKey)
        .eq("is_shop_active", true)
        .single();

      if (keyErr || !providerData) {
        return jsonResponse({ error: "Invalid API key" }, 401);
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
    tags, images, created_at, updated_at,
    product_categories(id, slug, name_de, name_en),
    service_providers(id, company_name, city)
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

  // Log API usage
  await logApiUsage(supabase, providerId, "create_product");

  return jsonResponse({ data }, 201);
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
  ];

  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: "No fields to update" }, 400);
  }

  const { data, error } = await supabase
    .from("metashop_products")
    .update(updates)
    .eq("id", productId)
    .select()
    .single();

  if (error) {
    console.error("Update error:", error);
    return jsonResponse({ error: "Failed to update product: " + error.message }, 400);
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
