-- ============================================================
-- Migration 110: Tauwerk-Art als feste Kategorie am Equipment
-- ============================================================
-- Verankert die 5 Tauwerk-Arten (aus dem Konfigurator-Foto) als echte
-- Klassifizierung — nicht nur als Formular-Dropdown. Grundlage für die
-- Organisation der Tauwerk-Ausrüstung UND fürs spätere Vendorshop-Matching.
--
-- Werte identisch zu RopeMaterial (iOS) / ROPE_MATERIALS (Web) /
-- rope_configurations.material.
--
-- NUR SCHEMA. Die Zuordnung bestehender Einträge (Reklassifizierung) läuft
-- über ein separates, vorab abgestimmtes UPDATE-Skript.
-- ============================================================

ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS rope_type TEXT;

ALTER TABLE equipment
    DROP CONSTRAINT IF EXISTS equipment_rope_type_valid;

ALTER TABLE equipment
    ADD CONSTRAINT equipment_rope_type_valid CHECK (
        rope_type IS NULL OR rope_type IN (
            'geschlagen',
            'kern_mantel',
            'squareline',
            'pes_dyneema',
            'dyneema_hohlgeflecht'
        )
    );

-- Teil-Index nur auf klassifizierte Tauwerk-Einträge (klein & schnell).
CREATE INDEX IF NOT EXISTS idx_equipment_rope_type
    ON equipment (rope_type)
    WHERE rope_type IS NOT NULL;
