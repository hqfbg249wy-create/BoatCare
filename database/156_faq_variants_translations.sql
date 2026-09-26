-- 156_faq_variants_translations.sql
-- Varianten-FAQ (155) in FR/IT/ES/NL uebersetzen und die Bestelldaten-FAQ
-- um den Varianten-Hinweis in denselben Sprachen ergaenzen. DE-Basis + EN
-- bestehen bereits.

-- ── Neuer Varianten-FAQ-Eintrag: FR/IT/ES/NL ──
UPDATE public.provider_faqs
SET translations = translations
  || jsonb_build_object('fr', jsonb_build_object(
      'question', $$Puis-je créer des variantes de produit (diamètre, taille, couleur) ?$$,
      'answer', $$Oui, de trois façons :

1) Directement dans le portail fournisseur sur le produit (section « Variantes »).
2) Via CSV/Excel : plusieurs lignes avec le MÊME nom de produit forment UN produit avec variantes. Colonnes : variante1_name, variante1_wert (option variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Astuce : « Exporter le stock » télécharge vos produits actuels déjà au nouveau format.
3) Via l'API produit (POST/PUT) avec variant_options + variants :

{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}

Le POST/PUT remplace toutes les variantes existantes (tableau vide = suppression). Pour une commande, l'API/webhook renvoie la variante choisie par ligne (variant_sku et attributes).$$))
  || jsonb_build_object('it', jsonb_build_object(
      'question', $$Posso creare varianti di prodotto (diametro, taglia, colore)?$$,
      'answer', $$Sì, in tre modi:

1) Direttamente nel portale fornitori sul prodotto (sezione "Varianti").
2) Via CSV/Excel: più righe con lo STESSO nome prodotto formano UN prodotto con varianti. Colonne: variante1_name, variante1_wert (opzionale variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Suggerimento: con "Esporta inventario" scarichi i tuoi prodotti già nel nuovo formato.
3) Tramite l'API prodotto (POST/PUT) con variant_options + variants:

{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}

Con POST/PUT "variants" sostituisce tutte le varianti esistenti (array vuoto = eliminazione). Per un ordine l'API/webhook restituisce la variante scelta per riga (variant_sku e attributes).$$))
  || jsonb_build_object('es', jsonb_build_object(
      'question', $$¿Puedo crear variantes de producto (diámetro, talla, color)?$$,
      'answer', $$Sí, de tres formas:

1) Directamente en el portal de proveedores en el producto (sección "Variantes").
2) Con CSV/Excel: varias filas con el MISMO nombre de producto forman UN producto con variantes. Columnas: variante1_name, variante1_wert (opcional variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Consejo: con "Exportar inventario" descargas tus productos actuales ya en el nuevo formato.
3) Mediante la API de productos (POST/PUT) con variant_options + variants:

{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}

En POST/PUT, "variants" reemplaza todas las variantes existentes (array vacío = eliminarlas). En un pedido, la API/webhook incluye la variante elegida por línea (variant_sku y attributes).$$))
  || jsonb_build_object('nl', jsonb_build_object(
      'question', $$Kan ik productvarianten (diameter, maat, kleur) aanmaken?$$,
      'answer', $$Ja, op drie manieren:

1) Rechtstreeks in het aanbiedersportaal bij het product (sectie "Varianten").
2) Via CSV/Excel: meerdere regels met DEZELFDE productnaam vormen ÉÉN product met varianten. Kolommen: variante1_name, variante1_wert (optioneel variante2_name/variante2_wert), variante_preis, variante_bestand, variante_sku, variante_bild. Tip: met "Voorraad exporteren" download je je huidige producten al in het nieuwe formaat.
3) Via de product-API (POST/PUT) met variant_options + variants:

{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}

Bij POST/PUT vervangt "variants" alle bestaande varianten (lege array = verwijderen). Bij een bestelling geeft de API/webhook per regel de gekozen variant mee (variant_sku en attributes).$$))
WHERE category = 'api' AND question ILIKE 'Kann ich Produktvarianten%';

-- ── Bestelldaten-FAQ: Varianten-Hinweis in FR/IT/ES/NL anhaengen ──
UPDATE public.provider_faqs SET translations = jsonb_set(translations, '{fr,answer}',
  to_jsonb((translations->'fr'->>'answer') || E'\n\nPour les produits avec variantes, chaque ligne inclut aussi la variante choisie : variant_sku ainsi que les attributs (p. ex. {"Durchmesser":"8mm"}).'))
WHERE id = 'b2db42e2-d435-42db-a0b3-88d0f9e9f855' AND translations ? 'fr';

UPDATE public.provider_faqs SET translations = jsonb_set(translations, '{it,answer}',
  to_jsonb((translations->'it'->>'answer') || E'\n\nPer i prodotti con varianti, ogni riga include anche la variante scelta: variant_sku e gli attributi (es. {"Durchmesser":"8mm"}).'))
WHERE id = 'b2db42e2-d435-42db-a0b3-88d0f9e9f855' AND translations ? 'it';

UPDATE public.provider_faqs SET translations = jsonb_set(translations, '{es,answer}',
  to_jsonb((translations->'es'->>'answer') || E'\n\nPara productos con variantes, cada línea incluye además la variante elegida: variant_sku y los atributos (p. ej. {"Durchmesser":"8mm"}).'))
WHERE id = 'b2db42e2-d435-42db-a0b3-88d0f9e9f855' AND translations ? 'es';

UPDATE public.provider_faqs SET translations = jsonb_set(translations, '{nl,answer}',
  to_jsonb((translations->'nl'->>'answer') || E'\n\nVoor producten met varianten bevat elke regel ook de gekozen variant: variant_sku plus de kenmerken (bijv. {"Durchmesser":"8mm"}).'))
WHERE id = 'b2db42e2-d435-42db-a0b3-88d0f9e9f855' AND translations ? 'nl';
