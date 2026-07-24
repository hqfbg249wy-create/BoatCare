-- ============================================================
-- Migration 112: Tauwerk-Arten manuell ergänzbar (Freitext)
-- ============================================================
-- Es gibt mehr Tauwerk-Arten als die 5 vordefinierten. Der CHECK aus
-- Migration 110 wird entfernt, damit beliebige (auch manuell ergänzte)
-- Arten gespeichert werden können. Die 5 bekannten Arten bleiben als
-- Vorschläge in der App erhalten.
--
-- rope_configurations.material ist bereits Freitext (kein CHECK).
-- ============================================================

ALTER TABLE equipment
    DROP CONSTRAINT IF EXISTS equipment_rope_type_valid;
