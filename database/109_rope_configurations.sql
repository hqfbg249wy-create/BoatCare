-- ============================================================
-- Migration 109: Tauwerk-Konfigurationen (Rope Configurations)
-- ============================================================
-- Kunden-Konfigurator für Spleiß-/Takelarbeiten, analog zu den
-- Segel-Maßblättern (sail_measurements) an ein Equipment gebunden.
--
-- Die Ende-Optionen (end1/end2) sind ein STANDARDISIERTER Katalog:
-- exakt diese Werte nutzen App, Web UND später das Provider-Produkt im
-- Vendorshop → 1:1-Matching möglich (der Deal läuft über den Shop, kein
-- Direkt-Mail-Geschäft am Shop vorbei).
-- ============================================================

CREATE TABLE IF NOT EXISTS rope_configurations (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id              UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Produkt (Tauwerk) — Artikelnummer matcht gegen metashop_products
    article_number            TEXT DEFAULT '',
    matched_product_id        UUID REFERENCES metashop_products(id) ON DELETE SET NULL,

    -- Maße
    length_m                  NUMERIC(10,2),   -- Länge in Metern
    material                  TEXT DEFAULT '',  -- Konstruktion (geschlagen, Kern-Mantel, Squareline, Dyneema …)
    diameter_mm               NUMERIC(10,2),   -- Stärke in mm

    -- Enden (standardisierter Options-Katalog)
    end1                      TEXT,
    end1_eye_length_cm        NUMERIC(10,2),   -- Auglänge bei individuellem Augspleiß
    end2                      TEXT,
    end2_eye_length_cm        NUMERIC(10,2),

    -- Zubehör + Freitext
    accessory_article_number  TEXT DEFAULT '',
    notes                     TEXT DEFAULT '',

    -- Lebenszyklus: draft → offer_requested (an Shop übergeben) → in_cart → ordered
    status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'offer_requested', 'in_cart', 'ordered')),

    CONSTRAINT rope_end1_valid CHECK (end1 IS NULL OR end1 IN (
        'glatt_abgeschnitten','takling',
        'augspleiss_indiv_mit_schamfil','augspleiss_indiv_ohne_schamfil',
        'augspleiss_3_5','augspleiss_6_8','augspleiss_9_12',
        'augspleiss_low_friction','augspleiss_kausch_edelstahl',
        'augspleiss_kausch_verzinkt','augspleiss_zubehoer'
    )),
    CONSTRAINT rope_end2_valid CHECK (end2 IS NULL OR end2 IN (
        'glatt_abgeschnitten','takling',
        'augspleiss_indiv_mit_schamfil','augspleiss_indiv_ohne_schamfil',
        'augspleiss_3_5','augspleiss_6_8','augspleiss_9_12',
        'augspleiss_low_friction','augspleiss_kausch_edelstahl',
        'augspleiss_kausch_verzinkt','augspleiss_zubehoer'
    ))
);

CREATE INDEX IF NOT EXISTS idx_rope_configurations_equipment_id
    ON rope_configurations (equipment_id);

ALTER TABLE rope_configurations ENABLE ROW LEVEL SECURITY;

-- Zugriff nur auf eigenes Tauwerk (über equipment → boats → owner_id).
CREATE POLICY "rope_configurations_select" ON rope_configurations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = rope_configurations.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "rope_configurations_insert" ON rope_configurations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = rope_configurations.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "rope_configurations_update" ON rope_configurations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = rope_configurations.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "rope_configurations_delete" ON rope_configurations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = rope_configurations.equipment_id
              AND b.owner_id = auth.uid()
        )
    );
