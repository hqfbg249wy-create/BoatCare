# Skipily Shop Integration – Basics (please read first)

These guides show you how to connect your existing online shop or your
inventory/ERP system to **Skipily** – **without any coding**.

There are separate step-by-step guides:
- `01-WooCommerce.md`
- `02-Shopify.md`
- `03-Odoo-ERP.md`

---

## What actually gets connected? (in plain words)

Think of Skipily as a **marketplace on a map** where boat owners find businesses
and products. For your shop to take part, two systems exchange data automatically –
in **two directions**:

1. **Your products → Skipily** (so customers can find them)
   Whenever you create or change a product, it is "reported" to Skipily.

2. **Orders ↔ back**
   - **Skipily → your system:** When someone buys from you via Skipily, you instantly
     receive an order (via a **webhook**).
   - **Your system → Skipily:** When you ship, you report the **status + tracking number**
     back, so the customer can see the shipment.

Two technical terms – simply explained:
- **API** = a "power socket" at Skipily into which your system can push data
  (products) or pull data (orders).
- **Webhook** = a "doorbell". When something happens (e.g. a new order), Skipily
  automatically rings the bell at your system – you don't have to keep checking.

To connect everything we use a **no-code tool** as a "translator" between the systems:
**[Make.com](https://www.make.com)** (the free plan is enough to start; alternative: Zapier).
You click the connection together instead of programming it.

---

## What you need ONCE (same for all guides)

1. **Your Skipily API key** (identifies your business)
   - Sign in at **https://provider.skipily.app**
   - Open **Settings → Integrations / API** → **Show/Create API key**
   - It looks like a long string. **Keep it secret** (like a password).
   - *Can't find the section?* → a short email to **support@skipily.app** and we'll
     enable it (requires the **Pro/Enterprise plan** or manual activation).

2. **The Skipily addresses** (you'll enter these later – collected here once):

   | Purpose | Address (URL) | Method |
   |---|---|---|
   | Create product | `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api` | POST |
   | Update product | `…/products-api?id=PRODUCT-ID` | PUT |
   | Fetch orders | `…/functions/v1/orders-api` | GET |
   | Report shipment/tracking | `…/orders-api?id=ORDER-ID` | PUT |

3. **Two "headers"** sent with EVERY call. Copy them 1:1 into Make/Zapier later:

   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ
   x-api-key: YOUR-SKIPILY-API-KEY
   Content-Type: application/json
   ```
   - The **`Authorization` value is public** and the same for everyone (the "door opener" to the Skipily gate).
   - The **`x-api-key` is YOUR secret key** from step 1 (tells Skipily who you are).

---

## Skipily product fields (which data moves over)

When creating/updating a product you can send these fields (all optional except **name**):

| Skipily field | Meaning | Example |
|---|---|---|
| `name` | Product name (required) | "Impeller Jabsco 1210-0001" |
| `sku` | your item number | "IMP-1210" |
| `part_number` | part/manufacturer number | "1210-0001" |
| `manufacturer` | manufacturer | "Jabsco" |
| `price` | price (number) | 24.90 |
| `currency` | currency | "EUR" |
| `stock_quantity` | stock level | 45 |
| `in_stock` | available? (true/false) | true |
| `shipping_cost` | shipping cost | 4.90 |
| `delivery_days` | delivery time in days | 3 |
| `ean` | EAN/barcode | "400123…" |
| `weight_kg` | weight | 0.3 |
| `description` | description | "Original impeller …" |

Remember the **Skipily product ID** returned when creating (field `id`) – you need it to
**update** later (PUT).

---

## Orders: status & feedback

- **Order status** at Skipily: `pending` → `confirmed` → `shipped` → `delivered`
  (or `cancelled`).
- **Report shipment** (PUT `orders-api?id=…`), example content:
  ```json
  { "status": "shipped", "tracking_number": "00340123…", "tracking_url": "https://…" }
  ```

---

## Shortcut: import ready-made templates (blueprints)

**Is there a ready-made Make template for Skipily?** Not in the public template gallery
(https://www.make.com/en/templates) yet – there you only find templates between well-known
app pairs (e.g. "WooCommerce → Google Sheets"). Skipily is connected via the universal
**HTTP module**, for which there is no gallery template.

**However:** Make can import ready-made scenarios as a file – so-called **blueprints**.
We provide three ready Skipily blueprints (in the `blueprints/` folder next to this
guide – or on request from support@skipily.app):

| File | What it prepares |
|---|---|
| `skipily-create-product.json` | Part A – Skipily call "create product" (URL, headers, body ready) |
| `skipily-receive-order.json` | Part B – webhook that receives Skipily orders |
| `skipily-report-shipment.json` | Part C – Skipily call "report shipment + tracking" |

**How to import a blueprint (takes 1 minute):**
1. In Make.com: **"Create a new scenario"**.
2. In the bottom toolbar click the **three dots "…" (More)** → **"Import Blueprint"** →
   choose the JSON file → **Save**.
3. Then just adjust **3 things** (also written as a note right on the module):
   - In the HTTP module, replace the placeholder for the **`x-api-key`** header with
     **your** Skipily API key.
   - **Add your shop module before/after** (e.g. "WooCommerce → Watch Products" before,
     or "Shopify → Create an Order" after – see the respective detail guide, Part A/B/C).
   - In the body, replace the `HERE-…` placeholders with the **fields of your shop**
     (by clicking the coloured "chips").

The import saves you typing the URL, headers and JSON skeleton – the detail guides still
apply for connecting to your shop system.

---

## The common thread (applies to all three systems)

1. **Get the API key** (above).
2. **Create a Make.com account** (free).
3. **Products → Skipily:** In Make build a "scenario": *trigger = new/changed product in
   your shop* → *action = call the Skipily API (products-api)*.
4. **Orders ← Skipily:** A second scenario in Make: *trigger = Skipily webhook (new order)*
   → *action = create the order in your shop/ERP*.
5. **Shipment → Skipily:** A third scenario: *trigger = shipment created* → *action =
   Skipily API `orders-api` (status "shipped" + tracking)*.
6. **Test** with a test product and a test order.

The three detail guides walk you through exactly these steps **click by click** for your
system.

> **Important:** Treat the `x-api-key` like a password. Anyone who has it can create
> products in your name. Don't share it by email/chat, don't show it in screenshots.
