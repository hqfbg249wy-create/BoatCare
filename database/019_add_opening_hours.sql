-- ============================================================
-- Migration 019: opening_hours Spalte zu service_providers
-- ============================================================
-- Öffnungszeiten als TEXT (mehrzeilig, eine Zeile pro Wochentag)
-- z.B. "Montag: 08:00–17:00\nDienstag: 08:00–17:00\n..."

ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS opening_hours TEXT;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 019: opening_hours Spalte hinzugefügt';
END $$;
