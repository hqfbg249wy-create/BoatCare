-- ============================================================
-- Migration 117: Tauwerk-Farbe
-- ============================================================
-- Zusätzliches Feld für die Farbe des Tauwerks in der
-- Konfiguration (z.B. "schwarz", "weiß/blau", "rot"). Freitext,
-- damit auch Mehrfarb-/Kennfaden-Angaben möglich sind.
-- ============================================================

ALTER TABLE rope_configurations
    ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';
