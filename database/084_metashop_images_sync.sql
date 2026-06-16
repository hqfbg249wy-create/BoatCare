-- Migration 084: Produktbild auch in der Detailansicht zeigen
--
-- Problem: Die Shop-Liste nutzt firstImageURL (fällt von images[] auf
-- image_url zurück) und zeigt das Bild. Die Detailansicht nutzt NUR das
-- images[]-Array. Produkte aus CSV-/API-Import haben aber nur image_url
-- gesetzt → images[] leer → Detail zeigt nur einen Platzhalter.
--
-- Fix (app-frei): images[] aus image_url befüllen — einmalig (Backfill)
-- und künftig automatisch per Trigger, egal über welchen Import-Weg.

-- ── 1) Backfill bestehender Produkte ──
UPDATE metashop_products
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND image_url <> ''
  AND (images IS NULL OR array_length(images, 1) IS NULL);

-- ── 2) Trigger: image_url → images[] synchron halten ──
CREATE OR REPLACE FUNCTION public.sync_metashop_images()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Wenn images leer/NULL ist, aber eine Einzel-URL existiert → übernehmen.
  IF (NEW.images IS NULL OR array_length(NEW.images, 1) IS NULL)
     AND NEW.image_url IS NOT NULL AND NEW.image_url <> '' THEN
    NEW.images := ARRAY[NEW.image_url];
  END IF;
  -- Umgekehrt: wenn images gesetzt, aber image_url leer → erstes Bild spiegeln
  -- (damit ältere Ansichten, die image_url lesen, auch funktionieren).
  IF (NEW.image_url IS NULL OR NEW.image_url = '')
     AND NEW.images IS NOT NULL AND array_length(NEW.images, 1) >= 1 THEN
    NEW.image_url := NEW.images[1];
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_metashop_images ON metashop_products;
CREATE TRIGGER trg_sync_metashop_images
  BEFORE INSERT OR UPDATE OF image_url, images ON metashop_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_metashop_images();
