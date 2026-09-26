-- 155_faq_variants.sql
-- FAQ/Anleitung um Produktvarianten (CSV/Excel + API) ergaenzen und die
-- Bestelldaten-FAQ um die Varianten-Felder im Webhook/Order erweitern.

INSERT INTO public.provider_faqs (category, question, answer, translations, sort_order, is_published)
VALUES (
  'api',
  $q$Kann ich Produktvarianten (Durchmesser, Groesse, Farbe) anlegen?$q$,
  $a$Ja, auf drei Wegen:

1) Direkt im Anbieter-Portal am Produkt (Abschnitt "Varianten").
2) Per CSV/Excel: mehrere Zeilen mit DEMSELBEN Produktnamen ergeben EIN Produkt mit Varianten. Spalten: variante1_name, variante1_wert (optional variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Tipp: unter "Bestand exportieren" laedst du deinen aktuellen Bestand bereits im neuen Format herunter, ergaenzt Varianten und importierst wieder.
3) Ueber die Produkt-API (POST/PUT) mit den Feldern variant_options + variants:

{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}

Beim POST/PUT ersetzt "variants" alle vorhandenen Varianten des Produkts (leeres Array loescht sie). Bei einer Bestellung liefert die Schnittstelle/der Webhook je Position die gewaehlte Variante mit (variant_sku und attributes).$a$,
  $t${
    "en": {
      "question": "Can I create product variants (diameter, size, color)?",
      "answer": "Yes, in three ways:\n\n1) Directly in the provider portal on the product (\"Variants\" section).\n2) Via CSV/Excel: several rows with the SAME product name become ONE product with variants. Columns: variante1_name, variante1_wert (optional variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Tip: use \"Export inventory\" to download your current products already in the new format, add variants and re-import.\n3) Via the product API (POST/PUT) using variant_options + variants:\n\n{\n  \"name\": \"Liros Race SK78\",\n  \"price\": 100.0,\n  \"variant_options\": [{ \"name\": \"Durchmesser\", \"values\": [\"6mm\", \"8mm\"] }],\n  \"variants\": [\n    { \"attributes\": { \"Durchmesser\": \"6mm\" }, \"price\": 100.0, \"stock_quantity\": 20, \"sku\": \"SK78-6\" },\n    { \"attributes\": { \"Durchmesser\": \"8mm\" }, \"price\": 120.0, \"stock_quantity\": 15, \"sku\": \"SK78-8\" }\n  ]\n}\n\nOn POST/PUT, \"variants\" replaces all existing variants of the product (empty array clears them). For an order, the API/webhook includes the chosen variant per line item (variant_sku and attributes)."
    }
  }$t$::jsonb,
  90, true
);

-- Bestelldaten-FAQ: Varianten-Hinweis anhaengen (DE-Basis + EN-Uebersetzung).
UPDATE public.provider_faqs
SET answer = answer || $x$

Bei Produkten mit Varianten enthaelt jede Position zusaetzlich die gewaehlte Variante: variant_sku sowie die Auspraegungen (z. B. {"Durchmesser":"8mm"}).$x$,
    translations = jsonb_set(
      translations,
      '{en,answer}',
      to_jsonb((translations->'en'->>'answer') ||
        E'\n\nFor products with variants, each line item also includes the chosen variant: variant_sku plus the attributes (e.g. {"Durchmesser":"8mm"}).')
    )
WHERE id = 'b2db42e2-d435-42db-a0b3-88d0f9e9f855'
  AND translations ? 'en';
