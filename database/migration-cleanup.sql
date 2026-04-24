-- CLEANUP MIGRATION: Alte 'address' Spalte entfernen
-- ⚠️ ACHTUNG: Nur ausführen NACHDEM du getestet hast:
--    1. Admin-Website funktioniert (Updates, Anzeige)
--    2. iOS-App funktioniert (Daten werden korrekt angezeigt)
--    3. Alle Daten sind korrekt migriert

-- ========================================
-- SICHERHEITSPRÜFUNG
-- ========================================

-- Prüfe, ob alle Daten aus 'address' nach 'street' migriert wurden
SELECT
    COUNT(*) as total_providers,
    COUNT(address) as has_address,
    COUNT(street) as has_street,
    COUNT(CASE WHEN address IS NOT NULL AND street IS NULL THEN 1 END) as missing_migration
FROM service_providers;

-- Zeige Datensätze, die noch nicht migriert wurden (falls vorhanden)
SELECT
    id,
    name,
    address,
    street
FROM service_providers
WHERE address IS NOT NULL AND street IS NULL;

-- ⚠️ Wenn die Abfrage oben Datensätze zeigt, STOPP!
-- Diese müssen erst migriert werden, bevor du weitermachst.

-- ========================================
-- SPALTE LÖSCHEN
-- ========================================

-- Entferne die alte 'address' Spalte
ALTER TABLE service_providers DROP COLUMN IF EXISTS address;

-- ========================================
-- SCHEMA-CACHE NEU LADEN
-- ========================================

NOTIFY pgrst, 'reload schema';

-- ========================================
-- ABSCHLUSS-PRÜFUNG
-- ========================================

-- Prüfe, ob 'address' entfernt wurde
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'service_providers'
  AND column_name IN ('address', 'street', 'city', 'postal_code', 'country')
ORDER BY ordinal_position;

-- Zeige finale Datenstruktur
SELECT
    id,
    name,
    street,
    postal_code,
    city,
    country
FROM service_providers
LIMIT 10;

SELECT '✅ Migration abgeschlossen! Die Spalte "address" wurde entfernt.' as status;
