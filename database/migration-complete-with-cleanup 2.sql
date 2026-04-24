-- VOLLSTÄNDIGE MIGRATION: Adressfelder aufteilen
-- 1. Neue Felder anlegen
-- 2. Bestehende Daten migrieren
-- 3. Testen
-- 4. Alte Spalte 'address' löschen

-- ========================================
-- TEIL 1: STRUKTUR VORBEREITEN
-- ========================================

-- Zeige aktuelle Struktur (Info)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'service_providers'
  AND column_name IN ('address', 'street', 'city', 'postal_code', 'country')
ORDER BY ordinal_position;

-- Füge alle fehlenden Spalten hinzu
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

-- ========================================
-- TEIL 2: DATEN MIGRIEREN
-- ========================================

-- Migriere 'address' nach 'street' (nur wenn street noch NULL ist)
UPDATE service_providers
SET street = address
WHERE street IS NULL AND address IS NOT NULL;

-- Falls bereits Daten in alten Spalten existieren, hier beispielhaft migrieren
-- (Passe dies an, wenn du bereits Daten in anderen Spalten hast)

-- HINWEIS: Wenn du bereits Daten in postal_code, city oder country hast,
-- werden diese NICHT überschrieben (nur NULL-Werte werden gefüllt)

-- ========================================
-- TEIL 3: KOMMENTARE HINZUFÜGEN
-- ========================================

COMMENT ON COLUMN service_providers.street IS 'Straße und Hausnummer';
COMMENT ON COLUMN service_providers.postal_code IS 'Postleitzahl';
COMMENT ON COLUMN service_providers.city IS 'Stadt/Ort';
COMMENT ON COLUMN service_providers.country IS 'Land';

-- ========================================
-- TEIL 4: RPC-FUNKTION ERSTELLEN
-- ========================================

-- Lösche alte Funktion (falls vorhanden mit alten Parametern)
DROP FUNCTION IF EXISTS update_service_provider(uuid,text,text,text,text,text,text,text,double precision,double precision,text,text,text,text[],text[]);

-- Erstelle neue RPC-Funktion
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

-- ========================================
-- TEIL 5: SCHEMA-CACHE NEU LADEN
-- ========================================

NOTIFY pgrst, 'reload schema';

-- ========================================
-- TEIL 6: ERGEBNIS PRÜFEN
-- ========================================

-- Zähle gefüllte Felder
SELECT
    COUNT(*) as total_providers,
    COUNT(address) as has_address,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country
FROM service_providers;

-- Zeige Beispieldaten (ALLE Adressfelder)
SELECT
    id,
    name,
    address,
    street,
    postal_code,
    city,
    country
FROM service_providers
LIMIT 10;

-- ========================================
-- WICHTIG: NÄCHSTE SCHRITTE
-- ========================================
-- 1. Prüfe die Ausgabe oben - sind alle Daten korrekt migriert?
-- 2. Teste die Admin-Website - funktionieren Updates?
-- 3. Teste die iOS-App - werden Daten korrekt angezeigt?
-- 4. ERST DANN führe die Cleanup-Migration aus (siehe migration-cleanup.sql)

-- ========================================
-- HINWEIS
-- ========================================
-- Die 'address' Spalte wird NICHT automatisch gelöscht!
-- Das machen wir erst nach erfolgreichen Tests.
-- Siehe dazu: migration-cleanup.sql
