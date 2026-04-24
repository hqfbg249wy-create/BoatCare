-- ============================================================
-- Migration 017: boats Tabelle reparieren / vervollständigen
-- ============================================================
-- Problem: Die boats-Tabelle wurde ggf. ohne die Spalte "type"
--          angelegt, oder mit abweichendem Schema.
--          Dieser Fix stellt sicher, dass alle Spalten existieren
--          die von der iOS App erwartet werden.
--
-- Ausführen in Supabase SQL-Editor
-- ============================================================

-- Tabelle anlegen falls noch nicht vorhanden
CREATE TABLE IF NOT EXISTS boats (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT '',
    boat_type    TEXT NOT NULL DEFAULT '',
    manufacturer TEXT NOT NULL DEFAULT '',
    model        TEXT NOT NULL DEFAULT '',
    year         TEXT NOT NULL DEFAULT '',
    length       TEXT NOT NULL DEFAULT '',
    engine       TEXT NOT NULL DEFAULT '',
    home_port    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spalten sicher hinzufügen (IF NOT EXISTS verhindert Fehler wenn schon vorhanden)
ALTER TABLE boats ADD COLUMN IF NOT EXISTS boat_type    TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS manufacturer TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS model        TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS year         TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS length       TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS engine       TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS home_port    TEXT NOT NULL DEFAULT '';

-- Falls die Spalte noch "type" heißt: umbenennen nach "boat_type"
-- (type ist ein reserviertes Wort in PostgreSQL – boat_type ist sicherer)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'boats' AND column_name = 'type'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'boats' AND column_name = 'boat_type'
    ) THEN
        ALTER TABLE boats RENAME COLUMN "type" TO boat_type;
        RAISE NOTICE '✅ Spalte "type" wurde zu "boat_type" umbenannt';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'boats' AND column_name = 'type'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'boats' AND column_name = 'boat_type'
    ) THEN
        -- Beide existieren: Daten kopieren, alte Spalte entfernen
        UPDATE boats SET boat_type = "type" WHERE boat_type = '';
        ALTER TABLE boats DROP COLUMN "type";
        RAISE NOTICE '✅ Spalte "type" wurde in "boat_type" migriert und entfernt';
    ELSE
        RAISE NOTICE 'ℹ️ boat_type existiert bereits korrekt';
    END IF;
END $$;

-- RLS sicherstellen
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own boats" ON boats;
CREATE POLICY "Users can manage own boats"
    ON boats
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Index sicherstellen
CREATE INDEX IF NOT EXISTS idx_boats_owner_id ON boats(owner_id);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION update_boats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS boats_updated_at ON boats;
CREATE TRIGGER boats_updated_at
    BEFORE UPDATE ON boats
    FOR EACH ROW
    EXECUTE FUNCTION update_boats_updated_at();

-- Verifikation: Zeige finales Schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'boats'
ORDER BY ordinal_position;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 017 abgeschlossen – boats-Tabelle ist bereit';
END $$;
