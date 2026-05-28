-- ============================================================================
-- Migration 068: Test-Produkt-Bilder + TestData-Flag
-- ============================================================================
-- Zweck:
--   Aktuell sind im Test-Provider-Shop viele Produkte ohne Bilder. Für die
--   Apple-Prüfung soll der Shop optisch sauber wirken. Diese Migration:
--
--     1. Fügt eine is_test_data-Spalte hinzu (für späteren Cleanup)
--     2. Weist Stock-Photos zu — nach Kategorie / Keyword im Produktnamen
--     3. Markiert die geupdateten Produkte als Test-Daten
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


-- ─── Schritt 2: Stock-Photos zuweisen ──────────────────────────────────────
-- Nur Produkte ohne Bilder bekommen welche.
-- Die CASE-Logik matched gängige Kategorien/Marken im Produktnamen.

UPDATE metashop_products
SET
  images = ARRAY[
    CASE
      -- Motor / Engine / Antrieb -----------------------------------------
      WHEN name ILIKE '%motor%' OR name ILIKE '%engine%' OR name ILIKE '%antrieb%'
           OR category ILIKE '%engine%' OR category ILIKE '%motor%'
        THEN 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=600&q=80&auto=format&fit=crop'

      -- Filter / Öl / Schmierung -----------------------------------------
      WHEN name ILIKE '%filter%' OR name ILIKE '%öl%' OR name ILIKE '%oil%'
           OR name ILIKE '%schmier%' OR name ILIKE '%lubric%'
        THEN 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=600&q=80&auto=format&fit=crop'

      -- Impeller / Pumpen ------------------------------------------------
      WHEN name ILIKE '%impeller%' OR name ILIKE '%pump%' OR name ILIKE '%pumpe%'
        THEN 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=600&q=80&auto=format&fit=crop'

      -- Anker / Kette ----------------------------------------------------
      WHEN name ILIKE '%anker%' OR name ILIKE '%anchor%' OR name ILIKE '%kette%'
           OR name ILIKE '%chain%' OR category ILIKE '%anchor%'
        THEN 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&q=80&auto=format&fit=crop'

      -- Seil / Tampen / Leinen / Rigging ---------------------------------
      WHEN name ILIKE '%seil%' OR name ILIKE '%tampen%' OR name ILIKE '%leine%'
           OR name ILIKE '%rope%' OR name ILIKE '%line%' OR name ILIKE '%rigg%'
           OR category ILIKE '%rigging%' OR category ILIKE '%rope%'
        THEN 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600&q=80&auto=format&fit=crop'

      -- Segel / Tuch -----------------------------------------------------
      WHEN name ILIKE '%segel%' OR name ILIKE '%sail%' OR name ILIKE '%genua%'
           OR name ILIKE '%spinnaker%' OR category ILIKE '%sail%'
        THEN 'https://images.unsplash.com/photo-1500036353762-e74daa3e6db4?w=600&q=80&auto=format&fit=crop'

      -- Elektrik / Batterie / Solar --------------------------------------
      WHEN name ILIKE '%batterie%' OR name ILIKE '%battery%' OR name ILIKE '%solar%'
           OR name ILIKE '%elektr%' OR name ILIKE '%electric%'
           OR category ILIKE '%electrical%'
        THEN 'https://images.unsplash.com/photo-1620283085439-39620a1e21c4?w=600&q=80&auto=format&fit=crop'

      -- Navigation / GPS / Plotter ---------------------------------------
      WHEN name ILIKE '%gps%' OR name ILIKE '%plotter%' OR name ILIKE '%kompass%'
           OR name ILIKE '%compass%' OR name ILIKE '%radar%'
           OR category ILIKE '%navigation%'
        THEN 'https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?w=600&q=80&auto=format&fit=crop'

      -- Sicherheit / Rettung ---------------------------------------------
      WHEN name ILIKE '%rettung%' OR name ILIKE '%life%' OR name ILIKE '%safety%'
           OR name ILIKE '%signal%' OR name ILIKE '%feuer%'
           OR category ILIKE '%safety%'
        THEN 'https://images.unsplash.com/photo-1568207018596-a0f9f9c6a0e9?w=600&q=80&auto=format&fit=crop'

      -- Farben / Antifouling / Lack --------------------------------------
      WHEN name ILIKE '%antifouling%' OR name ILIKE '%farbe%' OR name ILIKE '%paint%'
           OR name ILIKE '%lack%' OR category ILIKE '%paint%'
        THEN 'https://images.unsplash.com/photo-1582719188393-bb71ca45dbb9?w=600&q=80&auto=format&fit=crop'

      -- Reinigung / Pflege -----------------------------------------------
      WHEN name ILIKE '%reinig%' OR name ILIKE '%clean%' OR name ILIKE '%polish%'
           OR name ILIKE '%wachs%' OR name ILIKE '%pflege%'
        THEN 'https://images.unsplash.com/photo-1583912267550-aa07fc0c11b9?w=600&q=80&auto=format&fit=crop'

      -- Beleuchtung / Lampen ---------------------------------------------
      WHEN name ILIKE '%licht%' OR name ILIKE '%light%' OR name ILIKE '%lampe%'
           OR name ILIKE '%led%' OR name ILIKE '%lantern%'
        THEN 'https://images.unsplash.com/photo-1565847908213-71a73c3f7e57?w=600&q=80&auto=format&fit=crop'

      -- Werkzeug / Tools -------------------------------------------------
      WHEN name ILIKE '%werkzeug%' OR name ILIKE '%tool%' OR name ILIKE '%schraub%'
           OR name ILIKE '%key%'
        THEN 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&q=80&auto=format&fit=crop'

      -- Fallback: deterministisches Stock-Photo (Picsum) per Produkt-ID
      ELSE 'https://picsum.photos/seed/' || id::text || '/600/600'
    END
  ],
  is_test_data = true,
  updated_at = now()
WHERE
  (images IS NULL OR cardinality(images) = 0)
  AND is_active = true;


-- ─── Schritt 3: Auch image_url-Legacy-Feld füllen (falls genutzt) ──────────
UPDATE metashop_products
SET image_url = images[1]
WHERE image_url IS NULL AND images IS NOT NULL AND cardinality(images) > 0;


-- ─── Schritt 4: Statistik-Ausgabe ──────────────────────────────────────────
DO $$
DECLARE
  v_total       INT;
  v_test_data   INT;
  v_with_images INT;
BEGIN
  SELECT COUNT(*) INTO v_total       FROM metashop_products WHERE is_active = true;
  SELECT COUNT(*) INTO v_test_data   FROM metashop_products WHERE is_test_data = true;
  SELECT COUNT(*) INTO v_with_images FROM metashop_products
    WHERE is_active = true AND images IS NOT NULL AND cardinality(images) > 0;

  RAISE NOTICE '─────────────────────────────────────────────────';
  RAISE NOTICE 'Migration 068 abgeschlossen.';
  RAISE NOTICE '  Aktive Produkte gesamt:      %', v_total;
  RAISE NOTICE '  Davon mit Bildern jetzt:     % (sollten = total sein)', v_with_images;
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
