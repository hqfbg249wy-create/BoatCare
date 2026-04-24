-- ============================================================
-- FIX: RLS Policy für Scraper-Import (Service Role / anon)
-- Ausführen in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Option A: Erlaube anon inserts für service_providers
-- (nur für lokalen Admin-Scraper, da der anon key sowieso lokal bleibt)

DROP POLICY IF EXISTS "Authenticated users can insert providers" ON service_providers;

CREATE POLICY "Anyone can insert providers" ON service_providers
  FOR INSERT WITH CHECK (true);

-- Verification
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'service_providers';
