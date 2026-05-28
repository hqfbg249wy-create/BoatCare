-- ============================================================================
-- Migration 068: Produkt-spezifische KI-Bilder für Test-Produkte
-- ============================================================================
-- Zweck:
--   Test-Produkte zeigen aktuell keine Bilder — beim Apple-Review fällt das
--   negativ auf. Diese Migration weist jedem Produkt ohne Bild eine
--   PRODUKT-SPEZIFISCHE KI-generierte Stock-Photo-URL zu (Pollinations.ai).
--
--   Pollinations.ai = freier Image-Generation-Service via URL. Erzeugt
--   E-Commerce-style Produktfotos basierend auf einem Prompt — der Prompt
--   wird aus Hersteller + Modell + Produktname zusammengesetzt.
--
--   So bekommt "Yanmar 3JH5E Impeller Kit" ein KI-generiertes Impeller-Bild,
--   nicht ein generisches Boots-Foto.
--
-- Trade-Offs:
--   - Erstes Laden pro Bild ~5-15s (CDN cached danach)
--   - KI-generiert, also nicht 100% korrekt — aber plausibel + uniform
--   - Kostenlos, kein API-Key
--
-- Pre-Warming für Apple-Review:
--   Damit der Reviewer keine Wartezeiten sieht, vor dem Submit einmalig
--   alle Produkte in der App durchscrollen — Pollinations cached dann jedes
--   Bild für ~24h. Danach laden sie instant.
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


-- ─── Schritt 2: Hilfsfunktion für URL-encoded AI-Prompt ────────────────────
-- Säubert den Prompt-Text:
--   - Umlaute durch ae/oe/ue ersetzen (besser für AI-Modell)
--   - Alles außer alphanumerisch + Space entfernen
--   - Spaces → '+' (URL-Format)
--   - Mehrfache Spaces zu einem
CREATE OR REPLACE FUNCTION _sanitize_prompt(input TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  cleaned := input;
  cleaned := replace(cleaned, 'ä', 'ae');
  cleaned := replace(cleaned, 'ö', 'oe');
  cleaned := replace(cleaned, 'ü', 'ue');
  cleaned := replace(cleaned, 'Ä', 'Ae');
  cleaned := replace(cleaned, 'Ö', 'Oe');
  cleaned := replace(cleaned, 'Ü', 'Ue');
  cleaned := replace(cleaned, 'ß', 'ss');
  cleaned := regexp_replace(cleaned, '[^a-zA-Z0-9 ]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := trim(cleaned);
  cleaned := replace(cleaned, ' ', '+');
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ─── Schritt 3: Kategorie ableiten + cap auf 20 pro Kategorie ──────────────
WITH classified AS (
  SELECT
    id, name, manufacturer, part_number, category,
    CASE
      WHEN name ILIKE '%motor%' OR name ILIKE '%engine%' OR name ILIKE '%antrieb%'
           OR category ILIKE '%engine%' OR category ILIKE '%motor%'                THEN 'engine'
      WHEN name ILIKE '%filter%'                                                   THEN 'filter'
      WHEN name ILIKE '%öl%' OR name ILIKE '%oil%'
           OR name ILIKE '%schmier%' OR name ILIKE '%lubric%'                      THEN 'oil'
      WHEN name ILIKE '%impeller%' OR name ILIKE '%pump%' OR name ILIKE '%pumpe%'  THEN 'pump'
      WHEN name ILIKE '%anker%' OR name ILIKE '%anchor%'                           THEN 'anchor'
      WHEN name ILIKE '%kette%' OR name ILIKE '%chain%'                            THEN 'chain'
      WHEN name ILIKE '%seil%' OR name ILIKE '%tampen%' OR name ILIKE '%leine%'
           OR name ILIKE '%rope%' OR name ILIKE '%line%'                           THEN 'rope'
      WHEN name ILIKE '%rigg%' OR category ILIKE '%rigging%'                       THEN 'rigging'
      WHEN name ILIKE '%segel%' OR name ILIKE '%sail%' OR name ILIKE '%genua%'
           OR name ILIKE '%spinnaker%'                                             THEN 'sails'
      WHEN name ILIKE '%batterie%' OR name ILIKE '%battery%'                       THEN 'battery'
      WHEN name ILIKE '%solar%'                                                    THEN 'solar'
      WHEN name ILIKE '%elektr%' OR name ILIKE '%electric%'                        THEN 'electrical'
      WHEN name ILIKE '%gps%' OR name ILIKE '%plotter%'                            THEN 'gps'
      WHEN name ILIKE '%kompass%' OR name ILIKE '%compass%'                        THEN 'compass'
      WHEN name ILIKE '%radar%'                                                    THEN 'radar'
      WHEN name ILIKE '%rettung%' OR name ILIKE '%life%'                           THEN 'safety'
      WHEN name ILIKE '%signal%' OR name ILIKE '%feuer%'                           THEN 'flare'
      WHEN name ILIKE '%antifouling%'                                              THEN 'antifouling'
      WHEN name ILIKE '%farbe%' OR name ILIKE '%paint%' OR name ILIKE '%lack%'     THEN 'paint'
      WHEN name ILIKE '%reinig%' OR name ILIKE '%clean%'                           THEN 'cleaning'
      WHEN name ILIKE '%polish%' OR name ILIKE '%wachs%'                           THEN 'polish'
      WHEN name ILIKE '%licht%' OR name ILIKE '%light%' OR name ILIKE '%lampe%'
           OR name ILIKE '%led%'                                                   THEN 'lighting'
      WHEN name ILIKE '%werkzeug%' OR name ILIKE '%tool%' OR name ILIKE '%schraub%' THEN 'tools'
      ELSE                                                                              'generic'
    END AS img_category,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN name ILIKE '%motor%' OR name ILIKE '%engine%' OR name ILIKE '%antrieb%'
               OR category ILIKE '%engine%' OR category ILIKE '%motor%'                THEN 'engine'
          WHEN name ILIKE '%filter%'                                                   THEN 'filter'
          WHEN name ILIKE '%öl%' OR name ILIKE '%oil%'
               OR name ILIKE '%schmier%' OR name ILIKE '%lubric%'                      THEN 'oil'
          WHEN name ILIKE '%impeller%' OR name ILIKE '%pump%' OR name ILIKE '%pumpe%'  THEN 'pump'
          WHEN name ILIKE '%anker%' OR name ILIKE '%anchor%'                           THEN 'anchor'
          WHEN name ILIKE '%kette%' OR name ILIKE '%chain%'                            THEN 'chain'
          WHEN name ILIKE '%seil%' OR name ILIKE '%tampen%' OR name ILIKE '%leine%'
               OR name ILIKE '%rope%' OR name ILIKE '%line%'                           THEN 'rope'
          WHEN name ILIKE '%rigg%' OR category ILIKE '%rigging%'                       THEN 'rigging'
          WHEN name ILIKE '%segel%' OR name ILIKE '%sail%' OR name ILIKE '%genua%'
               OR name ILIKE '%spinnaker%'                                             THEN 'sails'
          WHEN name ILIKE '%batterie%' OR name ILIKE '%battery%'                       THEN 'battery'
          WHEN name ILIKE '%solar%'                                                    THEN 'solar'
          WHEN name ILIKE '%elektr%' OR name ILIKE '%electric%'                        THEN 'electrical'
          WHEN name ILIKE '%gps%' OR name ILIKE '%plotter%'                            THEN 'gps'
          WHEN name ILIKE '%kompass%' OR name ILIKE '%compass%'                        THEN 'compass'
          WHEN name ILIKE '%radar%'                                                    THEN 'radar'
          WHEN name ILIKE '%rettung%' OR name ILIKE '%life%'                           THEN 'safety'
          WHEN name ILIKE '%signal%' OR name ILIKE '%feuer%'                           THEN 'flare'
          WHEN name ILIKE '%antifouling%'                                              THEN 'antifouling'
          WHEN name ILIKE '%farbe%' OR name ILIKE '%paint%' OR name ILIKE '%lack%'     THEN 'paint'
          WHEN name ILIKE '%reinig%' OR name ILIKE '%clean%'                           THEN 'cleaning'
          WHEN name ILIKE '%polish%' OR name ILIKE '%wachs%'                           THEN 'polish'
          WHEN name ILIKE '%licht%' OR name ILIKE '%light%' OR name ILIKE '%lampe%'
               OR name ILIKE '%led%'                                                   THEN 'lighting'
          WHEN name ILIKE '%werkzeug%' OR name ILIKE '%tool%' OR name ILIKE '%schraub%' THEN 'tools'
          ELSE                                                                              'generic'
        END
      ORDER BY created_at NULLS LAST, id
    ) AS rn_in_category
  FROM metashop_products
  WHERE
    (images IS NULL OR cardinality(images) = 0)
    AND is_active = true
)
-- ─── Schritt 4: Pollinations-URL pro Produkt zuweisen ──────────────────────
-- Der Prompt setzt sich aus konkretem Produktnamen + Kategorie-Hinweis +
-- Stil-Anweisungen zusammen — so bekommt jedes Produkt ein eigenes Bild,
-- nicht alle dasselbe.
UPDATE metashop_products p
SET
  images = ARRAY[
    'https://image.pollinations.ai/prompt/' ||
    _sanitize_prompt(
      'professional studio product photography of ' ||
      COALESCE(NULLIF(p.manufacturer, '') || ' ', '') ||
      p.name ||
      CASE c.img_category
        WHEN 'engine'      THEN ' marine boat engine part'
        WHEN 'filter'      THEN ' marine filter cartridge'
        WHEN 'oil'         THEN ' marine engine oil bottle'
        WHEN 'pump'        THEN ' marine impeller rubber pump'
        WHEN 'anchor'      THEN ' marine boat anchor'
        WHEN 'chain'       THEN ' galvanized marine chain'
        WHEN 'rope'        THEN ' nautical marine rope coiled'
        WHEN 'rigging'     THEN ' marine rigging hardware shackle'
        WHEN 'sails'       THEN ' folded sailcloth marine sail'
        WHEN 'battery'     THEN ' marine deep cycle battery'
        WHEN 'solar'       THEN ' marine solar panel'
        WHEN 'electrical'  THEN ' marine electrical component'
        WHEN 'gps'         THEN ' marine GPS chartplotter device'
        WHEN 'compass'     THEN ' nautical compass'
        WHEN 'radar'       THEN ' marine radar antenna'
        WHEN 'safety'      THEN ' marine life jacket safety vest'
        WHEN 'flare'       THEN ' emergency signal flare'
        WHEN 'antifouling' THEN ' antifouling paint can'
        WHEN 'paint'       THEN ' marine paint can'
        WHEN 'cleaning'    THEN ' marine cleaning product bottle'
        WHEN 'polish'      THEN ' marine boat polish wax'
        WHEN 'lighting'    THEN ' marine LED navigation light'
        WHEN 'tools'       THEN ' marine tools wrench'
        ELSE                    ' marine boat accessory'
      END ||
      ' isolated on pure white background, e-commerce product photography, sharp focus, high detail, no shadow, 4k'
    ) ||
    '?width=400&height=400&nologo=true&model=flux&seed=' ||
    abs(hashtext(p.id::text))::text
  ],
  is_test_data = true,
  updated_at   = now()
FROM classified c
WHERE p.id = c.id
  AND c.rn_in_category <= 20;


-- ─── Schritt 5: Legacy image_url-Feld parallel füllen ──────────────────────
UPDATE metashop_products
SET image_url = images[1]
WHERE image_url IS NULL AND images IS NOT NULL AND cardinality(images) > 0;


-- ─── Schritt 6: Hilfsfunktion wieder aufräumen ─────────────────────────────
DROP FUNCTION IF EXISTS _sanitize_prompt(TEXT);


-- ─── Schritt 7: Statistik-Ausgabe + Pre-Warming-Hinweis ────────────────────
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
  RAISE NOTICE '  Weiterhin ohne Bild:         % (über 20er-Cap je Kategorie)', v_without;
  RAISE NOTICE '  Als TestData markiert:       %', v_test_data;
  RAISE NOTICE '─────────────────────────────────────────────────';
  RAISE NOTICE 'WICHTIG: Pre-Warm-Schritt vor Apple-Submit';
  RAISE NOTICE '  Einmal durch den Shop scrollen — alle Bilder antippen.';
  RAISE NOTICE '  Pollinations cached die Bilder für ~24h, danach laden';
  RAISE NOTICE '  sie instant. Sonst wartet Reviewer auf erste Generierung.';
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
