-- ============================================
-- Migration: Umbenennung von type -> category
-- ============================================
--
-- Zweck: Macht das Datenbank-Schema konsistent mit der Admin Web App
--        und den Swift-Modellen, die "category" erwarten.
--
-- Wichtig: Diese Migration konvertiert auch von ENUM -> TEXT für
--          mehr Flexibilität bei neuen Kategorien.
--
-- Ausführung: In Supabase SQL Console ausführen
-- ============================================

-- 1. Neue TEXT-Spalte "category" hinzufügen
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Daten von "type" -> "category" kopieren (ENUM -> TEXT Konvertierung)
UPDATE service_providers
SET category = type::TEXT
WHERE category IS NULL;

-- 3. Alte "type"-Spalte entfernen
ALTER TABLE service_providers DROP COLUMN IF EXISTS type;

-- 4. "category" als NOT NULL setzen
ALTER TABLE service_providers ALTER COLUMN category SET NOT NULL;

-- 5. Index auf "category" erstellen (ersetzt idx_providers_type)
DROP INDEX IF EXISTS idx_providers_type;
CREATE INDEX idx_providers_category ON service_providers(category);

-- ============================================
-- Optional: provider_type ENUM entfernen
-- ============================================
-- Uncomment if you want to remove the ENUM completely:
-- DROP TYPE IF EXISTS provider_type CASCADE;

-- ============================================
-- Verification
-- ============================================

-- Zeige alle Kategorien und ihre Anzahl
SELECT
    category,
    COUNT(*) as count,
    COUNT(DISTINCT city) as cities
FROM service_providers
GROUP BY category
ORDER BY count DESC;

-- Prüfe Schema: "category" sollte existieren, "type" nicht mehr
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'service_providers'
AND column_name IN ('type', 'category')
ORDER BY column_name;

-- Prüfe Indizes
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'service_providers'
AND indexname LIKE '%category%' OR indexname LIKE '%type%';

-- Zeige erste 5 Provider mit neuer Spalte
SELECT
    id,
    name,
    category,
    city,
    country
FROM service_providers
LIMIT 5;

-- ============================================
-- Erfolg-Meldung
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration abgeschlossen!';
    RAISE NOTICE '📊 Alle "type" Werte wurden nach "category" kopiert';
    RAISE NOTICE '🗑️  Alte "type" Spalte wurde entfernt';
    RAISE NOTICE '📇 Index "idx_providers_category" wurde erstellt';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  WICHTIG: Nach dieser Migration müssen Sie:';
    RAISE NOTICE '   1. Die iOS App neu kompilieren';
    RAISE NOTICE '   2. Die Admin Web App funktioniert sofort (verwendet bereits "category")';
END $$;
