-- ============================================================================
-- Migration 068: Test-Produkt-Bilder + TestData-Flag
-- ============================================================================
-- Zweck:
--   Aktuell sind im Test-Provider-Shop viele Produkte ohne Bilder. Für die
--   Apple-Prüfung soll der Shop optisch sauber wirken. Diese Migration:
--
--     1. Fügt eine is_test_data-Spalte hinzu (für späteren Cleanup)
--     2. Weist Stock-Photos zu — nach Kategorie / Keyword im Produktnamen
--     3. Limitiert auf max. 20 Produkte je Kategorie (mehr braucht's nicht)
--     4. Markiert die geupdateten Produkte als Test-Daten
--
-- Bild-Auflösung:
--   400 × 400 px @ q=85 — klein genug für schnelles Laden auf Mobile,
--   scharf bei den üblichen Card-Größen (~150 px) auch auf Retina-Displays
--   (~30-60 KB pro Bild).
--
-- Stock-Photos:
--   - Primär: Unsplash CDN (CC0, kommerziell nutzbar, keine Attribution)
--   - Fallback: picsum.photos (deterministisch via Seed, immer verfügbar)
--
-- Cleanup (nach echtem Provider-Onboarding):
--   Siehe Block am Ende dieser Datei — auskommentieren + ausführen.
-- ============================================================================

-- ─── Schritt 1: is_test_data-Spalte hinzufügen ──────────────────────────────
ALTER TABLE metashop_products
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_metashop_products_is_test_data
  ON metashop_products (is_test_data) WHERE is_test_data = true;

COMMENT ON COLUMN metashop_products.is_test_data IS
  'Markierung für seed/test-Produkte aus Migration 068. Nach echtem Provider-Onboarding via DELETE WHERE is_test_data=true bereinigbar.';


-- ─── Schritt 2: Kategorie pro Produkt ableiten (für Limit-Logik) ───────────
-- Wir kategorisieren jedes bildlose Produkt anhand seines Namens und der
-- gespeicherten category-Spalte. Pro abgeleiteter Kategorie behalten wir
-- die ersten 20 Produkte (nach created_at sortiert) — der Rest bleibt
-- unverändert / bildlos. So vermeiden wir Überseed bei großen Kategorien.

WITH classified AS (
  SELECT
    id,
    name,
    CASE
      WHEN name ILIKE '%motor%' OR name ILIKE '%engine%' OR name ILIKE '%antrieb%'
           OR category ILIKE '%engine%' OR category ILIKE '%motor%'                THEN 'engine'
      WHEN name ILIKE '%filter%' OR name ILIKE '%öl%' OR name ILIKE '%oil%'
           OR name ILIKE '%schmier%' OR name ILIKE '%lubric%'                      THEN 'oil_filter'
      WHEN name ILIKE '%impeller%' OR name ILIKE '%pump%' OR name ILIKE '%pumpe%'  THEN 'pump'
      WHEN name ILIKE '%anker%' OR name ILIKE '%anchor%' OR name ILIKE '%kette%'
           OR name ILIKE '%chain%' OR category ILIKE '%anchor%'                    THEN 'anchor'
      WHEN name ILIKE '%seil%' OR name ILIKE '%tampen%' OR name ILIKE '%leine%'
           OR name ILIKE '%rope%' OR name ILIKE '%line%' OR name ILIKE '%rigg%'
           OR category ILIKE '%rigging%' OR category ILIKE '%rope%'                THEN 'rigging'
      WHEN name ILIKE '%segel%' OR name ILIKE '%sail%' OR name ILIKE '%genua%'
           OR name ILIKE '%spinnaker%' OR category ILIKE '%sail%'                  THEN 'sails'
      WHEN name ILIKE '%batterie%' OR name ILIKE '%battery%' OR name ILIKE '%solar%'
           OR name ILIKE '%elektr%' OR name ILIKE '%electric%'
           OR category ILIKE '%electrical%'                                        THEN 'electrical'
      WHEN name ILIKE '%gps%' OR name ILIKE '%plotter%' OR name ILIKE '%kompass%'
           OR name ILIKE '%compass%' OR name ILIKE '%radar%'
           OR category ILIKE '%navigation%'                                        THEN 'navigation'
      WHEN name ILIKE '%rettung%' OR name ILIKE '%life%' OR name ILIKE '%safety%'
           OR name ILIKE '%signal%' OR name ILIKE '%feuer%'
           OR category ILIKE '%safety%'                                            THEN 'safety'
      WHEN name ILIKE '%antifouling%' OR name ILIKE '%farbe%' OR name ILIKE '%paint%'
           OR name ILIKE '%lack%' OR category ILIKE '%paint%'                      THEN 'paint'
      WHEN name ILIKE '%reinig%' OR name ILIKE '%clean%' OR name ILIKE '%polish%'
           OR name ILIKE '%wachs%' OR name ILIKE '%pflege%'                        THEN 'cleaning'
      WHEN name ILIKE '%licht%' OR name ILIKE '%light%' OR name ILIKE '%lampe%'
           OR name ILIKE '%led%' OR name ILIKE '%lantern%'                         THEN 'lighting'
      WHEN name ILIKE '%werkzeug%' OR name ILIKE '%tool%' OR name ILIKE '%schraub%'
           OR name ILIKE '%key%'                                                   THEN 'tools'
      ELSE                                                                              'other'
    END AS img_category,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN name ILIKE '%motor%' OR name ILIKE '%engine%' OR name ILIKE '%antrieb%'
               OR category ILIKE '%engine%' OR category ILIKE '%motor%'                THEN 'engine'
          WHEN name ILIKE '%filter%' OR name ILIKE '%öl%' OR name ILIKE '%oil%'
               OR name ILIKE '%schmier%' OR name ILIKE '%lubric%'                      THEN 'oil_filter'
          WHEN name ILIKE '%impeller%' OR name ILIKE '%pump%' OR name ILIKE '%pumpe%'  THEN 'pump'
          WHEN name ILIKE '%anker%' OR name ILIKE '%anchor%' OR name ILIKE '%kette%'
               OR name ILIKE '%chain%' OR category ILIKE '%anchor%'                    THEN 'anchor'
          WHEN name ILIKE '%seil%' OR name ILIKE '%tampen%' OR name ILIKE '%leine%'
               OR name ILIKE '%rope%' OR name ILIKE '%line%' OR name ILIKE '%rigg%'
               OR category ILIKE '%rigging%' OR category ILIKE '%rope%'                THEN 'rigging'
          WHEN name ILIKE '%segel%' OR name ILIKE '%sail%' OR name ILIKE '%genua%'
               OR name ILIKE '%spinnaker%' OR category ILIKE '%sail%'                  THEN 'sails'
          WHEN name ILIKE '%batterie%' OR name ILIKE '%battery%' OR name ILIKE '%solar%'
               OR name ILIKE '%elektr%' OR name ILIKE '%electric%'
               OR category ILIKE '%electrical%'                                        THEN 'electrical'
          WHEN name ILIKE '%gps%' OR name ILIKE '%plotter%' OR name ILIKE '%kompass%'
               OR name ILIKE '%compass%' OR name ILIKE '%radar%'
               OR category ILIKE '%navigation%'                                        THEN 'navigation'
          WHEN name ILIKE '%rettung%' OR name ILIKE '%life%' OR name ILIKE '%safety%'
               OR name ILIKE '%signal%' OR name ILIKE '%feuer%'
               OR category ILIKE '%safety%'                                            THEN 'safety'
          WHEN name ILIKE '%antifouling%' OR name ILIKE '%farbe%' OR name ILIKE '%paint%'
               OR name ILIKE '%lack%' OR category ILIKE '%paint%'                      THEN 'paint'
          WHEN name ILIKE '%reinig%' OR name ILIKE '%clean%' OR name ILIKE '%polish%'
               OR name ILIKE '%wachs%' OR name ILIKE '%pflege%'                        THEN 'cleaning'
          WHEN name ILIKE '%licht%' OR name ILIKE '%light%' OR name ILIKE '%lampe%'
               OR name ILIKE '%led%' OR name ILIKE '%lantern%'                         THEN 'lighting'
          WHEN name ILIKE '%werkzeug%' OR name ILIKE '%tool%' OR name ILIKE '%schraub%'
               OR name ILIKE '%key%'                                                   THEN 'tools'
          ELSE                                                                              'other'
        END
      ORDER BY created_at NULLS LAST, id
    ) AS rn_in_category
  FROM metashop_products
  WHERE
    (images IS NULL OR cardinality(images) = 0)
    AND is_active = true
)
-- ─── Schritt 3: Stock-Photos zuweisen, max 20 pro Kategorie ────────────────
UPDATE metashop_products p
SET
  images = ARRAY[
    CASE c.img_category
      WHEN 'engine'      THEN 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'oil_filter'  THEN 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'pump'        THEN 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'anchor'      THEN 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'rigging'     THEN 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'sails'       THEN 'https://images.unsplash.com/photo-1500036353762-e74daa3e6db4?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'electrical'  THEN 'https://images.unsplash.com/photo-1620283085439-39620a1e21c4?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'navigation'  THEN 'https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'safety'      THEN 'https://images.unsplash.com/photo-1568207018596-a0f9f9c6a0e9?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'paint'       THEN 'https://images.unsplash.com/photo-1582719188393-bb71ca45dbb9?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'cleaning'    THEN 'https://images.unsplash.com/photo-1583912267550-aa07fc0c11b9?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'lighting'    THEN 'https://images.unsplash.com/photo-1565847908213-71a73c3f7e57?w=400&h=400&fit=crop&q=85&auto=format'
      WHEN 'tools'       THEN 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&h=400&fit=crop&q=85&auto=format'
      -- Fallback: deterministisches Stock-Photo (Picsum) pro Produkt-ID
      ELSE                    'https://picsum.photos/seed/' || p.id::text || '/400/400'
    END
  ],
  is_test_data = true,
  updated_at   = now()
FROM classified c
WHERE p.id = c.id
  AND c.rn_in_category <= 20;


-- ─── Schritt 4: Legacy image_url-Feld parallel füllen ──────────────────────
UPDATE metashop_products
SET image_url = images[1]
WHERE image_url IS NULL AND images IS NOT NULL AND cardinality(images) > 0;


-- ─── Schritt 5: Statistik-Ausgabe ──────────────────────────────────────────
DO $$
DECLARE
  v_total       INT;
  v_test_data   INT;
  v_with_images INT;
  v_without     INT;
BEGIN
  SELECT COUNT(*) INTO v_total       FROM metashop_products WHERE is_active = true;
  SELECT COUNT(*) INTO v_test_data   FROM metashop_products WHERE is_test_data = true;
  SELECT COUNT(*) INTO v_with_images FROM metashop_products
    WHERE is_active = true AND images IS NOT NULL AND cardinality(images) > 0;
  v_without := v_total - v_with_images;

  RAISE NOTICE '─────────────────────────────────────────────────';
  RAISE NOTICE 'Migration 068 abgeschlossen.';
  RAISE NOTICE '  Aktive Produkte gesamt:      %', v_total;
  RAISE NOTICE '  Davon mit Bildern jetzt:     %', v_with_images;
  RAISE NOTICE '  Weiterhin ohne Bild:         % (über 20er-Cap je Kategorie hinaus)', v_without;
  RAISE NOTICE '  Als TestData markiert:       %', v_test_data;
  RAISE NOTICE '─────────────────────────────────────────────────';
  RAISE NOTICE 'Cleanup nach echtem Provider-Onboarding:';
  RAISE NOTICE '  DELETE FROM metashop_products WHERE is_test_data = true;';
  RAISE NOTICE '─────────────────────────────────────────────────';
END $$;


-- ============================================================================
-- CLEANUP-SNIPPETS (für später — NICHT automatisch ausführen)
-- ============================================================================
-- Wenn ein echter Provider seinen Shop anbindet, kannst du alle Test-Produkte
-- auf einen Schlag löschen:
--
--   DELETE FROM metashop_products WHERE is_test_data = true;
--
-- Alternativ: nur die Bilder zurücksetzen, Produkte behalten:
--
--   UPDATE metashop_products
--      SET images = NULL, image_url = NULL, is_test_data = false
--    WHERE is_test_data = true;
--
-- Oder: alle Produkte eines bestimmten Test-Providers löschen:
--
--   DELETE FROM metashop_products
--    WHERE provider_id IN (
--      SELECT id FROM service_providers WHERE name ILIKE '%test%'
--    );
-- ============================================================================
