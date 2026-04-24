-- 023: Google-Places-Fotos von logo_url nach cover_image_url verschieben
-- Die bisherigen logo_url-Einträge sind Geschäfts-/Gebäudefotos von Google Places,
-- KEINE echten Firmenlogos. Sie gehören ins cover_image_url Feld.
-- Echte Logos werden später per Website-Enrichment extrahiert.

-- 1. Stelle sicher dass cover_image_url Spalte existiert
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- 2. Verschiebe logo_url → cover_image_url (nur wenn cover_image_url noch leer ist)
UPDATE service_providers
SET cover_image_url = logo_url,
    logo_url = NULL
WHERE logo_url IS NOT NULL
  AND (cover_image_url IS NULL OR cover_image_url = '');

-- Ergebnis prüfen
-- SELECT count(*) AS moved FROM service_providers WHERE cover_image_url IS NOT NULL AND logo_url IS NULL;
