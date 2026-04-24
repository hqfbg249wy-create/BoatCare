-- CLEANUP MIGRATION: View aktualisieren und alte 'address' Spalte entfernen
-- ⚠️ Nur ausführen NACHDEM alle Adressen erfolgreich migriert wurden!

-- ========================================
-- SCHRITT 1: SICHERHEITSPRÜFUNG
-- ========================================

-- Prüfe, ob alle Daten migriert wurden
SELECT
    COUNT(*) as total_providers,
    COUNT(address) as has_address,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country,
    COUNT(CASE WHEN address IS NOT NULL AND street IS NULL THEN 1 END) as nicht_migriert
FROM service_providers;

-- Zeige Datensätze, die noch nicht migriert wurden (falls vorhanden)
SELECT
    id,
    name,
    address,
    street,
    city
FROM service_providers
WHERE address IS NOT NULL AND street IS NULL
LIMIT 10;

-- ⚠️ Wenn die Abfrage oben Datensätze zeigt, STOPP!
-- Diese müssen erst migriert werden, bevor du weitermachst.

-- ========================================
-- SCHRITT 2: VIEW LÖSCHEN
-- ========================================

-- Lösche die alte View, die noch 'address' verwendet
DROP VIEW IF EXISTS providers_with_ratings;

-- ========================================
-- SCHRITT 3: SPALTE LÖSCHEN
-- ========================================

-- Entferne die alte 'address' Spalte
ALTER TABLE service_providers DROP COLUMN IF EXISTS address;

-- ========================================
-- SCHRITT 4: VIEW NEU ERSTELLEN (mit neuen Spalten)
-- ========================================

-- Erstelle die View neu mit den aufgeteilten Adressfeldern
CREATE OR REPLACE VIEW providers_with_ratings AS
SELECT
    id,
    user_id,
    name,
    category,
    description,
    phone,
    email,
    website,
    street,
    postal_code,
    city,
    country,
    latitude,
    longitude,
    rating,
    review_count,
    created_at,
    updated_at
FROM service_providers sp;

-- Optional: Erstelle auch ein computed field für die vollständige Adresse
COMMENT ON VIEW providers_with_ratings IS 'Service Providers mit Ratings - verwendet aufgeteilte Adressfelder (street, postal_code, city, country)';

-- ========================================
-- SCHRITT 5: SCHEMA-CACHE NEU LADEN
-- ========================================

NOTIFY pgrst, 'reload schema';

-- ========================================
-- SCHRITT 6: ABSCHLUSS-PRÜFUNG
-- ========================================

-- Prüfe, ob 'address' entfernt wurde
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'service_providers'
  AND column_name IN ('address', 'street', 'postal_code', 'city', 'country')
ORDER BY ordinal_position;

-- Prüfe, ob die View funktioniert
SELECT
    id,
    name,
    street,
    postal_code,
    city,
    country
FROM providers_with_ratings
LIMIT 10;

-- Zeige finale Statistik
SELECT
    COUNT(*) as total,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country,
    COUNT(CASE WHEN street IS NOT NULL AND postal_code IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL THEN 1 END) as vollstaendig
FROM service_providers;

-- ========================================
-- FERTIG!
-- ========================================

SELECT '✅ Migration abgeschlossen!' as status,
       'Die Spalte "address" wurde entfernt.' as detail1,
       'Die View "providers_with_ratings" wurde aktualisiert.' as detail2;
