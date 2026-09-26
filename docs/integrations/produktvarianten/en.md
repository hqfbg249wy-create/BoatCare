## Product variants (diameter, size, color)

Some products come in several versions, e.g. rope in different diameters or
clothing in sizes and colors. In Skipily you define **options** (e.g. "Diameter")
with **values** (e.g. 6mm, 8mm, 10mm). Each combination is a **variant** with its
own price, stock and optional SKU.

Three ways:

**1) In the provider portal (manual)**
Open the product and go to the "Variants" section. Add options and values; for
each combination enter price, stock and SKU.

**2) CSV/Excel import**
Several rows with the **same product name** become ONE product with variants.
Additional columns:

| Column | Meaning |
|---|---|
| `variante1_name` | name of the 1st option, e.g. Diameter |
| `variante1_wert` | value of this row, e.g. 8mm |
| `variante2_name` / `variante2_wert` | optional second option (e.g. color) |
| `variante_preis` | price of this variant |
| `variante_bestand` | stock of this variant |
| `variante_sku` | SKU of this variant |
| `variante_bild` | optional image URL of the variant |

Tip: use **"Export inventory"** to download your current products already in the
new format, add variants and re-import the file.

**3) Product API (POST/PUT)**
Send `variant_options` (definition) and `variants` (combinations). On POST/PUT,
`variants` replaces **all** existing variants (empty array = delete):

```json
{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}
```

**Orders:** on a purchase, the API and webhook include the chosen variant per line
item: `variant_sku` and the attributes (`attributes`, e.g. `{"Durchmesser":"8mm"}`).
That way your system knows exactly which variant was ordered.
