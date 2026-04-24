-- Migration 027: Multi-Kategorie Support (bis zu 3 Kategorien pro Provider)
-- Die erste Kategorie (category) bestimmt weiterhin das Pin-Icon auf der Karte

-- 1. Zusaetzliche Kategorie-Spalten fuer service_providers
ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS category2 TEXT,
  ADD COLUMN IF NOT EXISTS category3 TEXT;

-- 2. Zusaetzliche Kategorie-Spalten fuer provider_edit_suggestions
ALTER TABLE provider_edit_suggestions
  ADD COLUMN IF NOT EXISTS suggested_category2 TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category3 TEXT;

-- 3. PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
