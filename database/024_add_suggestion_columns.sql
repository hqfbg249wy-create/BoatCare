-- Migration 024: Fehlende Spalten in provider_edit_suggestions hinzufuegen
-- suggested_street (statt nur suggested_address) und suggested_opening_hours

ALTER TABLE provider_edit_suggestions
  ADD COLUMN IF NOT EXISTS suggested_street TEXT,
  ADD COLUMN IF NOT EXISTS suggested_opening_hours TEXT;
