-- Migration: Vollständige Adressfelder in service_providers Tabelle
-- FINALE VERSION - mit DROP der alten Funktion

-- Schritt 1: Prüfe aktuelle Struktur (nur Info)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'service_providers'
  AND column_name IN ('address', 'street', 'city', 'postal_code', 'country')
ORDER BY ordinal_position;

-- Schritt 2: Füge ALLE fehlenden Spalten hinzu
DO $$
BEGIN
    -- Straße (street)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_providers' AND column_name = 'street'
    ) THEN
        ALTER TABLE service_providers ADD COLUMN street TEXT;
        RAISE NOTICE 'Spalte street wurde hinzugefügt';
    ELSE
        RAISE NOTICE 'Spalte street existiert bereits';
    END IF;

    -- Postleitzahl (postal_code)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_providers' AND column_name = 'postal_code'
    ) THEN
        ALTER TABLE service_providers ADD COLUMN postal_code TEXT;
        RAISE NOTICE 'Spalte postal_code wurde hinzugefügt';
    ELSE
        RAISE NOTICE 'Spalte postal_code existiert bereits';
    END IF;

    -- Stadt (city)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_providers' AND column_name = 'city'
    ) THEN
        ALTER TABLE service_providers ADD COLUMN city TEXT;
        RAISE NOTICE 'Spalte city wurde hinzugefügt';
    ELSE
        RAISE NOTICE 'Spalte city existiert bereits';
    END IF;

    -- Land (country)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_providers' AND column_name = 'country'
    ) THEN
        ALTER TABLE service_providers ADD COLUMN country TEXT;
        RAISE NOTICE 'Spalte country wurde hinzugefügt';
    ELSE
        RAISE NOTICE 'Spalte country existiert bereits';
    END IF;
END $$;

-- Schritt 3: Migriere vorhandene Daten von 'address' nach 'street'
UPDATE service_providers
SET street = address
WHERE street IS NULL AND address IS NOT NULL;

-- Schritt 4: Kommentare hinzufügen
COMMENT ON COLUMN service_providers.street IS 'Straße und Hausnummer';
COMMENT ON COLUMN service_providers.postal_code IS 'Postleitzahl';
COMMENT ON COLUMN service_providers.city IS 'Stadt/Ort';
COMMENT ON COLUMN service_providers.country IS 'Land';

-- Schritt 5: LÖSCHE die alte Funktion (falls vorhanden)
DROP FUNCTION IF EXISTS update_service_provider(uuid,text,text,text,text,text,text,text,double precision,double precision,text,text,text,text[],text[]);

-- Schritt 6: Erstelle die NEUE RPC-Funktion mit korrekten Parametern
CREATE OR REPLACE FUNCTION update_service_provider(
    provider_id UUID,
    provider_name TEXT,
    provider_category TEXT,
    provider_description TEXT DEFAULT NULL,
    provider_street TEXT DEFAULT NULL,
    provider_postal_code TEXT DEFAULT NULL,
    provider_city TEXT DEFAULT NULL,
    provider_country TEXT DEFAULT NULL,
    provider_latitude DOUBLE PRECISION DEFAULT NULL,
    provider_longitude DOUBLE PRECISION DEFAULT NULL,
    provider_phone TEXT DEFAULT NULL,
    provider_email TEXT DEFAULT NULL,
    provider_website TEXT DEFAULT NULL,
    provider_services TEXT[] DEFAULT NULL,
    provider_brands TEXT[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE service_providers
    SET
        name = provider_name,
        category = provider_category,
        description = provider_description,
        street = provider_street,
        postal_code = provider_postal_code,
        city = provider_city,
        country = provider_country,
        latitude = provider_latitude,
        longitude = provider_longitude,
        phone = provider_phone,
        email = provider_email,
        website = provider_website,
        services = provider_services,
        brands = provider_brands,
        updated_at = NOW()
    WHERE id = provider_id;
END;
$$;

-- Schritt 7: Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';

-- Schritt 8: Prüfe Ergebnis
SELECT
    COUNT(*) as total_providers,
    COUNT(street) as with_street,
    COUNT(postal_code) as with_postal_code,
    COUNT(city) as with_city,
    COUNT(country) as with_country
FROM service_providers;

-- Zeige Beispieldaten
SELECT
    id,
    name,
    street,
    postal_code,
    city,
    country
FROM service_providers
LIMIT 5;
