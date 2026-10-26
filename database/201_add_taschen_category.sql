-- 201_add_taschen_category.sql
-- Neue Kategorie "Taschen" (Seesäcke, Dry Bags, Duffel) + Umhaengen der
-- entsprechenden Produkte, die bisher faelschlich unter "Bekleidung" lagen.
--
-- Einordnung: als Unterkategorie der Bekleidungs-/Ausruestungsgruppe
-- (parent_id = Bekleidung, wie "Schuhe"); passt zur Chandler-Logik
-- "Bekleidung & Ausruestung".
-- search_text der Produkte wird vom Trigger metashop_search_text_upd bei
-- category_id-Aenderung automatisch neu gebaut.

WITH new_cat AS (
  INSERT INTO public.product_categories
    (slug, name_de, name_en, name_fr, name_it, name_es, name_nl, icon, sort_order, parent_id)
  VALUES
    ('taschen', 'Taschen', 'Bags', 'Sacs', 'Borse', 'Bolsas', 'Tassen',
     'bag.fill', 3, '8db10d81-89bb-4bc9-9513-ec744be14cec')
  ON CONFLICT (slug) DO UPDATE SET
    name_de = EXCLUDED.name_de,
    name_en = EXCLUDED.name_en,
    name_fr = EXCLUDED.name_fr,
    name_it = EXCLUDED.name_it,
    name_es = EXCLUDED.name_es,
    name_nl = EXCLUDED.name_nl,
    icon = EXCLUDED.icon
  RETURNING id
)
UPDATE public.metashop_products
SET category_id = (SELECT id FROM new_cat)
WHERE id IN (
  '65ac4278-9fc1-4142-afa7-eff7fb1a5a6c',  -- 44.0014.03 HH LIGHT DRY BAG RED 20LT
  '126e39ad-ffae-414d-bf37-3f43e9b329ba',  -- 44.0015.02 HH OCEAN DRY BAG XL (43lt)
  'd8137699-e383-410e-a81e-886002d3e1f8',  -- FOR1410107 Sacco del marinaio
  'e268174a-62b1-4195-8d24-7625d87a7b57'   -- MH Helly Hansen Duffel Bag 2 - black - 70 lt.
);

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 201: Kategorie "Taschen" angelegt + 4 Taschen aus Bekleidung umgehaengt.';
END $$;
