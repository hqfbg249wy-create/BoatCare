-- 172_variant_images.sql
-- Bis zu 5 Bilder JE PRODUKTVARIANTE (statt nur einem image_url).
-- image_url bleibt als Titelbild (= images[1]) fuer Legacy/Cart-Vorschau
-- erhalten; neue Galerie nutzt product_variants.images (Reihenfolge = Blaettern).
--
-- Kompatibilitaet: bestehende Varianten mit image_url bekommen dieses als
-- erstes (und einziges) Element ihrer images-Liste.

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[];

-- Vorhandene Einzelbilder in die neue Liste uebernehmen.
UPDATE public.product_variants
   SET images = ARRAY[image_url]
 WHERE image_url IS NOT NULL
   AND image_url <> ''
   AND (images IS NULL OR array_length(images, 1) IS NULL);
