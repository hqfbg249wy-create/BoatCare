-- Prüfe vorhandene Daten in der service_providers Tabelle
-- Um zu sehen, welche Felder bereits Daten enthalten

-- 1. Zeige alle Spalten
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'service_providers'
ORDER BY ordinal_position;

-- 2. Zähle gefüllte Felder
SELECT
    COUNT(*) as total_providers,
    COUNT(address) as has_address,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country
FROM service_providers;

-- 3. Zeige Beispieldaten (alle Adressfelder)
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
