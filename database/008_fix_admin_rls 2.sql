-- ============================================
-- Fix RLS Policies für Admin Web Interface
-- ============================================

-- Dieser Fix stellt sicher, dass:
-- 1. Eingeloggte User auf ihre eigenen Daten zugreifen können
-- 2. Admins auf alle Daten zugreifen können
-- 3. ServiceProvider für alle lesbar sind (öffentliche App)

-- ============================================
-- PROFILES Tabelle
-- ============================================

-- Entferne alte Policies
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Neue Policies für profiles
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
ON profiles FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

-- ============================================
-- SERVICE_PROVIDERS Tabelle
-- ============================================

-- Entferne alte Policies
DROP POLICY IF EXISTS "ServiceProviders are publicly readable" ON service_providers;
DROP POLICY IF EXISTS "Admins can create providers" ON service_providers;
DROP POLICY IF EXISTS "Admins can update providers" ON service_providers;
DROP POLICY IF EXISTS "Admins can delete providers" ON service_providers;

-- Neue Policies für service_providers
CREATE POLICY "ServiceProviders are publicly readable"
ON service_providers FOR SELECT
USING (true);  -- Jeder kann lesen (für öffentliche App)

CREATE POLICY "Admins can insert providers"
ON service_providers FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "Admins can update providers"
ON service_providers FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "Admins can delete providers"
ON service_providers FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

-- ============================================
-- PROVIDER_EDIT_SUGGESTIONS Tabelle
-- ============================================

-- Entferne alte Policies
DROP POLICY IF EXISTS "Users can create suggestions" ON provider_edit_suggestions;
DROP POLICY IF EXISTS "Users can read own suggestions" ON provider_edit_suggestions;
DROP POLICY IF EXISTS "Admins can read all suggestions" ON provider_edit_suggestions;
DROP POLICY IF EXISTS "Admins can update suggestions" ON provider_edit_suggestions;

-- Neue Policies für provider_edit_suggestions
CREATE POLICY "Authenticated users can create suggestions"
ON provider_edit_suggestions FOR INSERT
WITH CHECK (auth.uid() = user_id::uuid);

CREATE POLICY "Users can read own suggestions"
ON provider_edit_suggestions FOR SELECT
USING (auth.uid() = user_id::uuid);

CREATE POLICY "Admins can read all suggestions"
ON provider_edit_suggestions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "Admins can update suggestions"
ON provider_edit_suggestions FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

-- ============================================
-- Verification
-- ============================================

-- Zeige alle aktiven Policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'service_providers', 'provider_edit_suggestions')
ORDER BY tablename, policyname;

-- Teste ob RLS aktiviert ist
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'service_providers', 'provider_edit_suggestions');
