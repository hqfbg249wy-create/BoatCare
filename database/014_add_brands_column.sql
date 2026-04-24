-- Migration 014: brands-Spalte zu service_providers hinzufügen
-- Die Spalte wurde in Migration 011 im SELECT referenziert aber nie angelegt.
-- Ausführen in Supabase SQL-Editor

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS brands TEXT[];

-- GIN-Index für schnelle Array-Suche (z.B. WHERE 'Garmin' = ANY(brands))
CREATE INDEX IF NOT EXISTS idx_providers_brands
  ON service_providers USING GIN (brands);

-- Verifikation
SELECT id, name, brands FROM service_providers LIMIT 5;
