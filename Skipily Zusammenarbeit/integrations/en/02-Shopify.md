# Connect Shopify ↔ Skipily (step by step)

> **Prerequisite:** First read `00-Skipily-Integration-Basics.md` and have your
> **Skipily API key** ready. You need a Shopify login with owner/admin rights.

We connect both via the free no-code tool **Make.com** – all by clicking, no programming.

> **⏱️ Shortcut – ready-made template:** A finished Make template "Shopify ↔ Skipily"
> does not exist in the public gallery (yet), but we provide **importable blueprints**
> (folder `blueprints/`) that pre-fill the entire Skipily part (URL, headers, JSON):
> `skipily-create-product.json` (Part A), `skipily-receive-order.json` (Part B),
> `skipily-report-shipment.json` (Part C). **Import:** New scenario → bottom **"…" (More)**
> → **"Import Blueprint"** → choose file. After that you only need to insert your
> `x-api-key`, add the Shopify module and map the fields – exactly what Parts A–C show.

**What works in the end:**
- New/changed product in Shopify → automatically appears on Skipily.
- Order on Skipily → automatically lands in Shopify.
- Shipment in Shopify (fulfillment) → status + tracking number go back to Skipily.

Allow **about 45 minutes**.

---

## Part 0 – Preparation (10 min)

1. **Create a Make.com account:** https://www.make.com → "Get started free".
2. Have your **Skipily API key** from the provider portal ready (see Basics).
3. Make prepares the Shopify connection itself – you need to create **nothing** manually
   in Shopify. On the first Shopify module you are redirected to your shop and click
   **"Install"** to allow Make to read/write products and orders. (Have your **shop
   address** ready, e.g. `your-shop.myshopify.com`.)

---

## Part A – Send products from Shopify to Skipily (15 min)

Goal: New/changed product in Shopify → automatically on Skipily.

1. In **Make.com** → **"Create a new scenario"** (top right).
2. Click **"+"** → search **"Shopify"** → module **"Watch Products"**.
   - **"Add"** at Connection → enter shop address → **install/confirm** in Shopify.
   - For "Watch" choose **"Created or updated"**.
3. Next to it click **"+"** → **"HTTP" → "Make a request"** (the Skipily call):
   - **URL:** `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api`
   - **Method:** `POST`
   - **Headers** (each "Add item"):
     - `Authorization` → `Bearer eyJhbGci…` (public value from the Basics)
     - `x-api-key` → **your Skipily API key**
     - `Content-Type` → `application/json`
   - **Body type:** `Raw` → **JSON (application/json)**
   - **Request content** (insert Shopify fields by clicking – the coloured "chips"):
     ```json
     {
       "name": "{{Title from Shopify}}",
       "sku": "{{Variant SKU from Shopify}}",
       "price": "{{Variant Price from Shopify}}",
       "currency": "EUR",
       "stock_quantity": "{{Inventory Quantity from Shopify}}",
       "in_stock": true,
       "description": "{{Body HTML / description from Shopify}}"
     }
     ```
4. **Save** → **"Run once"** → create a test product in Shopify → scenario runs green →
   product appears on Skipily.
5. Bottom left, turn **"Scheduling" ON** (e.g. every 15 min).

> **Tip – keep changes clean:** Store the `id` returned by Skipily per product (e.g. as a
> Shopify "metafield"). For later updates, use **PUT** on `…/products-api?id=THE-ID`. For
> the start, plain creation is enough.

---

## Part B – Create Skipily orders in Shopify (12 min)

Goal: purchase via Skipily → order automatically in Shopify. Skipily "rings" via **webhook**
at a Make address.

1. **New scenario** in Make.
2. First module **"Webhooks" → "Custom webhook"** → **"Add"** → name
   `Skipily orders` → **copy the URL**.
3. Store this URL in Skipily: **Provider portal → Settings → Integrations → "Webhook URL
   for orders"** → paste → save.
   *(No field? URL to support@skipily.app – we'll enter it.)*
4. Second module **"Shopify" → "Create an Order"**. Map the Skipily webhook fields
   (customer, items by SKU, quantity, price, shipping address).
5. **Save** + **Scheduling ON**.
6. **Test:** trigger a test order on Skipily → appears in Shopify.

> **Remember the Skipily order ID** (`order_id` / `order_number` from the webhook) – store
> it as a Shopify "note" or "metafield" on the order. You need it in Part C.

---

## Part C – Report shipment & tracking back to Skipily (10 min)

Goal: When you ship in Shopify (fulfillment with tracking), the customer sees "shipped" +
tracking number on Skipily.

1. **New scenario** in Make.
2. First module **"Shopify" → "Watch Fulfillments"** (or "Watch Orders" filtered on
   completed shipments).
3. Second module **"HTTP" → "Make a request"**:
   - **URL:** `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/orders-api?id={{Skipily order ID}}`
   - **Method:** `PUT`
   - **Headers:** the same three as in Part A.
   - **Body → Raw → JSON:**
     ```json
     {
       "status": "shipped",
       "tracking_number": "{{Tracking Number from Shopify}}",
       "tracking_url": "{{Tracking URL from Shopify}}"
     }
     ```
4. **Save**, **Run once** (create a fulfillment), then **Scheduling ON**.

---

## Done! ✅ Quick check

- [ ] Test product in Shopify → appears on Skipily (Part A)
- [ ] Test order on Skipily → appears in Shopify (Part B)
- [ ] Fulfillment in Shopify → Skipily shows "shipped" + tracking (Part C)

## If something goes wrong
- **"401/403":** `x-api-key` or `Authorization` value wrong/shifted – copy exactly again.
- **"400 – name required":** the `name` field in the body is empty → re-map Shopify "Title".
- **Order without items:** in Shopify the **SKU** must match the product – map items via SKU.
- **Nothing runs:** **Scheduling ON?** Scenario active (green) in Make?
- **Help:** **support@skipily.app** (ideally with a screenshot of the Make error).
