-- ============================================
-- Datenbank-Status prüfen
-- ============================================

-- 1. Prüfe ob Tabellen existieren
SELECT
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'service_providers', 'provider_edit_suggestions')
ORDER BY tablename;

-- 2. Zähle Einträge in jeder Tabelle
SELECT
    'profiles' as tabelle,
    COUNT(*) as anzahl
FROM profiles
UNION ALL
SELECT
    'service_providers',
    COUNT(*)
FROM service_providers
UNION ALL
SELECT
    'provider_edit_suggestions',
    COUNT(*)
FROM provider_edit_suggestions;

-- 3. Zeige Admin-User
SELECT
    id,
    email,
    full_name,
    role,
    created_at
FROM profiles
WHERE role = 'admin';

-- 4. Zeige RLS Status
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'service_providers', 'provider_edit_suggestions');

-- 5. Zeige alle RLS Policies
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
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'service_providers', 'provider_edit_suggestions')
ORDER BY tablename, policyname;

-- 6. Teste ob authenticated User Zugriff hat (nach Login)
-- Diese Query sollte nach dem Login funktionieren:
-- SELECT * FROM profiles WHERE id = auth.uid();

-- 7. Prüfe ob es überhaupt ServiceProvider gibt
SELECT
    id,
    name,
    category,
    city,
    created_at
FROM service_providers
ORDER BY created_at DESC
LIMIT 5;

-- 8. Prüfe ausstehende Änderungsvorschläge
SELECT
    id,
    provider_id,
    status,
    created_at
FROM provider_edit_suggestions
WHERE status = 'pending'
LIMIT 5;
