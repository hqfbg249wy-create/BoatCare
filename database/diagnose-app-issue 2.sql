-- DIAGNOSE: Warum zeigt die App keine ServiceProvider?

-- ========================================
-- 1. GRUNDLEGENDE CHECKS
-- ========================================

-- Wie viele Provider gibt es insgesamt?
SELECT COUNT(*) as total_providers FROM service_providers;

-- Welche Spalten existieren?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'service_providers'
ORDER BY ordinal_position;

-- ========================================
-- 2. DATENQUALITÄT PRÜFEN
-- ========================================

-- Zähle Datensätze mit/ohne Koordinaten
SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_coordinates,
    COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as missing_coordinates
FROM service_providers;

-- Zähle Datensätze mit/ohne Adressdaten
SELECT
    COUNT(*) as total,
    COUNT(street) as has_street,
    COUNT(city) as has_city,
    COUNT(country) as has_country,
    COUNT(CASE WHEN street IS NULL AND city IS NULL THEN 1 END) as no_address
FROM service_providers;

-- ========================================
-- 3. ZEIGE BEISPIELDATEN
-- ========================================

-- Zeige erste 5 Provider (wie die App sie sieht)
SELECT
    id,
    name,
    category,
    street,
    city,
    postal_code,
    country,
    latitude,
    longitude,
    phone,
    website
FROM service_providers
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 4. PRÜFE ALTE SPALTE
-- ========================================

-- Existiert die alte 'address' Spalte noch?
SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'service_providers' AND column_name = 'address'
        ) THEN 'JA - address-Spalte existiert noch! ⚠️'
        ELSE 'NEIN - address-Spalte wurde entfernt ✅'
    END as address_column_status;

-- ========================================
-- 5. ROW LEVEL SECURITY (RLS) PRÜFEN
-- ========================================

-- Sind RLS-Policies aktiv?
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'service_providers';

-- Ist RLS auf der Tabelle aktiviert?
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'service_providers';

-- ========================================
-- 6. TESTE SELECT (wie die App)
-- ========================================

-- Simuliere App-Query
SELECT * FROM service_providers LIMIT 3;

-- ========================================
-- ZUSAMMENFASSUNG
-- ========================================

SELECT
    'DIAGNOSE ABGESCHLOSSEN' as status,
    (SELECT COUNT(*) FROM service_providers) as total_providers,
    (SELECT COUNT(*) FROM service_providers WHERE latitude IS NOT NULL) as with_coordinates,
    (SELECT COUNT(*) FROM service_providers WHERE street IS NOT NULL OR city IS NOT NULL) as with_address;
