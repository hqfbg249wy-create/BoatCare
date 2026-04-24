-- Test: Prüfe ob die Schema-Migration erfolgreich war

-- 1. Zeige alle Spalten der service_providers Tabelle
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'service_providers'
ORDER BY ordinal_position;

-- 2. Zähle Datensätze
SELECT
    COUNT(*) as total_providers,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country,
    COUNT(latitude) as has_latitude,
    COUNT(longitude) as has_longitude
FROM service_providers;

-- 3. Zeige Beispieldaten
SELECT
    id,
    name,
    category,
    street,
    postal_code,
    city,
    country,
    latitude,
    longitude
FROM service_providers
LIMIT 10;

-- 4. Prüfe ob alte 'address' Spalte noch existiert
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'service_providers'
  AND column_name = 'address';

-- 5. Teste ob die View funktioniert (falls sie existiert)
SELECT COUNT(*) as view_count
FROM providers_with_ratings
LIMIT 1;
