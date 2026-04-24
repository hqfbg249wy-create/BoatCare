-- ============================================================
-- VOLLSTÄNDIGER FIX: RLS Policies + Kategorie-Migration
-- Ausführen in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- SCHRITT 1: Alle fehlenden RLS Policies hinzufügen
-- (INSERT existiert bereits, UPDATE und DELETE fehlen noch)

-- UPDATE Policy für anon (für Scraper-Kategorien-Update)
DROP POLICY IF EXISTS "Anyone can update providers" ON service_providers;
CREATE POLICY "Anyone can update providers" ON service_providers
  FOR UPDATE USING (true) WITH CHECK (true);

-- SELECT Policy sicherstellen (falls noch nicht vorhanden)
DROP POLICY IF EXISTS "Anyone can read providers" ON service_providers;
CREATE POLICY "Anyone can read providers" ON service_providers
  FOR SELECT USING (true);

-- ============================================================
-- SCHRITT 2: Deutsche Kategorien → Englische Standardwerte
-- ============================================================

UPDATE service_providers SET category = 'motor service'
WHERE category IN ('Werkstatt', 'Werft', 'Reparatur', 'Motor Service', 'Motorservice');

UPDATE service_providers SET category = 'marine supplies'
WHERE category IN ('Zubehör', 'Ausrüstung', 'Nautik');

UPDATE service_providers SET category = 'sailmaker'
WHERE category IN ('Segelmacher', 'Segel & Persenning');

UPDATE service_providers SET category = 'instruments'
WHERE category IN ('Instrumente', 'Elektronik', 'Marine Electronics');

UPDATE service_providers SET category = 'fuel'
WHERE category IN ('Tankstelle', 'Kraftstoff', 'Diesel');

UPDATE service_providers SET category = 'marina'
WHERE category IN ('Marina', 'Hafen', 'Yachthafen');

UPDATE service_providers SET category = 'surveyor'
WHERE category IN ('Gutachter', 'Sachverständiger');

UPDATE service_providers SET category = 'crane'
WHERE category IN ('Kran', 'Krane');

UPDATE service_providers SET category = 'painting'
WHERE category IN ('Lackierung', 'Antifouling');

UPDATE service_providers SET category = 'rigging'
WHERE category IN ('Rigg', 'Rigg Service', 'Tauwerk');

-- ============================================================
-- SCHRITT 3: Auch categories Array auf Englisch migrieren
-- ============================================================

UPDATE service_providers
SET categories = ARRAY['motor service']
WHERE category = 'motor service' AND (categories @> ARRAY['Werkstatt'] OR categories @> ARRAY['Motor Service']);

UPDATE service_providers
SET categories = ARRAY['marine supplies']
WHERE category = 'marine supplies' AND (categories @> ARRAY['Zubehör'] OR categories @> ARRAY['Ausrüstung']);

UPDATE service_providers
SET categories = ARRAY['sailmaker']
WHERE category = 'sailmaker' AND categories @> ARRAY['Segelmacher'];

UPDATE service_providers
SET categories = ARRAY['instruments']
WHERE category = 'instruments' AND (categories @> ARRAY['Instrumente'] OR categories @> ARRAY['Elektronik']);

UPDATE service_providers
SET categories = ARRAY['fuel']
WHERE category = 'fuel' AND (categories @> ARRAY['Tankstelle'] OR categories @> ARRAY['Kraftstoff']);

UPDATE service_providers
SET categories = ARRAY['marina']
WHERE category = 'marina' AND (categories @> ARRAY['Marina'] OR categories @> ARRAY['Hafen']);

UPDATE service_providers
SET categories = ARRAY['surveyor']
WHERE category = 'surveyor' AND categories @> ARRAY['Gutachter'];

UPDATE service_providers
SET categories = ARRAY['crane']
WHERE category = 'crane' AND (categories @> ARRAY['Kran'] OR categories @> ARRAY['Krane']);

UPDATE service_providers
SET categories = ARRAY['rigging']
WHERE category = 'rigging' AND (categories @> ARRAY['Rigg'] OR categories @> ARRAY['Tauwerk']);

UPDATE service_providers
SET categories = ARRAY['sailmaker']
WHERE category = 'sailmaker' AND categories @> ARRAY['Segelmacher'];

-- ============================================================
-- ERGEBNIS PRÜFEN
-- ============================================================

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'service_providers'
ORDER BY cmd;

SELECT category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY count DESC;
