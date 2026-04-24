-- Migration 013: boats Tabelle pro User
-- Ausführen in Supabase SQL-Editor
-- HINWEIS: Falls die Tabelle bereits mit owner_id existiert, wird nur die Policy/Index angelegt.

-- Tabelle anlegen (falls noch nicht vorhanden)
CREATE TABLE IF NOT EXISTS boats (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT '',
    manufacturer TEXT NOT NULL DEFAULT '',
    model        TEXT NOT NULL DEFAULT '',
    year         TEXT NOT NULL DEFAULT '',
    length       TEXT NOT NULL DEFAULT '',
    engine       TEXT NOT NULL DEFAULT '',
    home_port    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security aktivieren
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;

-- Alte Policy löschen falls vorhanden, dann neu anlegen
DROP POLICY IF EXISTS "Users can manage own boats" ON boats;
CREATE POLICY "Users can manage own boats"
    ON boats
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Index für schnellere User-Abfragen
CREATE INDEX IF NOT EXISTS idx_boats_owner_id ON boats(owner_id);

-- updated_at automatisch aktualisieren
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
