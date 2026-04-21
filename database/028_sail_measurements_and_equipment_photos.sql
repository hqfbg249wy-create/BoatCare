-- ============================================================
-- Migration 028: Segel-Maßblätter, Equipment-Fotos & Avatar-URL
-- ============================================================
-- Neue Features:
--   1. sail_measurements Tabelle für strukturierte Segel-Maßblatt-Daten
--   2. equipment_photos Tabelle für bis zu 5 Fotos pro Ausrüstung
--   3. avatar_url Spalte in profiles sicherstellen
--   4. Storage Buckets & Policies für user-photos
-- ============================================================

-- ============================================================
-- 1. sail_measurements Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS sail_measurements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    sail_type       TEXT NOT NULL CHECK (sail_type IN ('grosssegel', 'vorsegel', 'gennaker', 'code0')),
    date            DATE DEFAULT CURRENT_DATE,
    sail_number     TEXT DEFAULT '',
    notes           TEXT DEFAULT '',

    -- Großsegel (Mainsail) Rigg-Maße
    gs_p            NUMERIC(10,2),   -- Mastlänge P
    gs_e            NUMERIC(10,2),   -- Baumlänge E
    gs_e1           NUMERIC(10,2),   -- E1
    gs_a            NUMERIC(10,2),   -- Achterliek A
    gs_g            NUMERIC(10,2),   -- G
    gs_al           NUMERIC(10,2),   -- AL
    -- Großsegel Segel-Maße
    gs_rb           NUMERIC(10,2),   -- Roach Bottom
    gs_ru           NUMERIC(10,2),   -- Roach Upper
    gs_cb           NUMERIC(10,2),   -- Camber Bottom
    gs_cu           NUMERIC(10,2),   -- Camber Upper
    gs_r1           NUMERIC(10,2),   -- R1
    gs_r2           NUMERIC(10,2),   -- R2
    -- Großsegel Details
    gs_unterliekstau    TEXT DEFAULT '',
    gs_vorliekstau      TEXT DEFAULT '',
    gs_schothornrutscher TEXT DEFAULT '',
    gs_mastrutscher     TEXT DEFAULT '',
    -- Großsegel Optionen (Boolean)
    gs_einleinenreff        BOOLEAN DEFAULT false,
    gs_weicher_fussteil     BOOLEAN DEFAULT false,
    gs_loses_unterliek      BOOLEAN DEFAULT false,
    gs_segelzeichen         BOOLEAN DEFAULT false,
    gs_segelnummer          BOOLEAN DEFAULT false,
    gs_farbe                TEXT DEFAULT '',

    -- Vorsegel (Jib/Genua) Rigg-Maße
    vs_i            NUMERIC(10,2),   -- Vorstag I
    vs_i2           NUMERIC(10,2),   -- I2
    vs_vst          NUMERIC(10,2),   -- Vorstagversatz
    vs_j            NUMERIC(10,2),   -- J
    vs_j2           NUMERIC(10,2),   -- J2
    -- Vorsegel Segel-Maße
    vs_vl           NUMERIC(10,2),   -- Vorliek
    vs_al1          NUMERIC(10,2),   -- Achterliek oben
    vs_al2          NUMERIC(10,2),   -- Achterliek unten
    vs_t1           NUMERIC(10,2),   -- T1
    vs_t2           NUMERIC(10,2),   -- T2
    vs_w            NUMERIC(10,2),   -- W
    vs_q            NUMERIC(10,2),   -- Q
    vs_k            NUMERIC(10,2),   -- K
    -- Vorsegel Details
    vs_h            NUMERIC(10,2),   -- H
    vs_reffanlage   TEXT DEFAULT '',
    vs_vorliekstau  TEXT DEFAULT '',
    -- Vorsegel Optionen
    vs_rollreff     BOOLEAN DEFAULT false,
    vs_fenster      BOOLEAN DEFAULT false,
    vs_uv_schutz    BOOLEAN DEFAULT false,
    vs_position     TEXT DEFAULT '',  -- 'BB' oder 'STB'
    vs_farbe        TEXT DEFAULT '',

    -- Gennaker / Code 0
    gk_luff_length  NUMERIC(10,2),
    gk_leech_length NUMERIC(10,2),
    gk_foot_length  NUMERIC(10,2),
    gk_mid_width    NUMERIC(10,2),
    gk_tack_height  NUMERIC(10,2),
    gk_material     TEXT DEFAULT '',
    gk_farbe        TEXT DEFAULT '',

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index für schnelle Abfrage nach Equipment
CREATE INDEX IF NOT EXISTS idx_sail_measurements_equipment_id
    ON sail_measurements (equipment_id);

-- RLS aktivieren
ALTER TABLE sail_measurements ENABLE ROW LEVEL SECURITY;

-- Benutzer können ihre eigenen Segel-Maßblätter lesen/schreiben
-- (über equipment → boats → owner_id)
CREATE POLICY "sail_measurements_select" ON sail_measurements
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = sail_measurements.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "sail_measurements_insert" ON sail_measurements
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = sail_measurements.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "sail_measurements_update" ON sail_measurements
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = sail_measurements.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "sail_measurements_delete" ON sail_measurements
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = sail_measurements.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

-- ============================================================
-- 2. equipment_photos Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS equipment_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    photo_url       TEXT NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index für schnelle Abfrage nach Equipment
CREATE INDEX IF NOT EXISTS idx_equipment_photos_equipment_id
    ON equipment_photos (equipment_id);

-- RLS aktivieren
ALTER TABLE equipment_photos ENABLE ROW LEVEL SECURITY;

-- Benutzer können Fotos ihrer eigenen Ausrüstung verwalten
CREATE POLICY "equipment_photos_select" ON equipment_photos
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = equipment_photos.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "equipment_photos_insert" ON equipment_photos
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = equipment_photos.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

CREATE POLICY "equipment_photos_delete" ON equipment_photos
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM equipment e
            JOIN boats b ON b.id = e.boat_id
            WHERE e.id = equipment_photos.equipment_id
              AND b.owner_id = auth.uid()
        )
    );

-- Max 5 Fotos pro Equipment-Item erzwingen
CREATE OR REPLACE FUNCTION check_max_equipment_photos()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM equipment_photos WHERE equipment_id = NEW.equipment_id) >= 5 THEN
        RAISE EXCEPTION 'Maximal 5 Fotos pro Ausrüstungsgegenstand erlaubt';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_max_equipment_photos ON equipment_photos;
CREATE TRIGGER enforce_max_equipment_photos
    BEFORE INSERT ON equipment_photos
    FOR EACH ROW EXECUTE FUNCTION check_max_equipment_photos();

-- ============================================================
-- 3. avatar_url in profiles sicherstellen
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================
-- 4. Storage Bucket "user-photos" mit Policies
-- ============================================================

-- Bucket erstellen (idempotent via INSERT ... ON CONFLICT)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Bestehende Policies aufräumen
DROP POLICY IF EXISTS "user_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "user_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "user_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "user_photos_delete" ON storage.objects;

-- Lesezugriff: öffentlich (für Avatar-Anzeige und Equipment-Fotos)
CREATE POLICY "user_photos_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'user-photos');

-- Upload: nur authentifizierte Benutzer, nur in ihren eigenen Ordner
-- Pfade: avatars/{user_id}.jpg oder equipment/{boat_id}/{equipment_id}_*.jpg
CREATE POLICY "user_photos_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'user-photos'
        AND (
            -- Avatar: avatars/{eigene_user_id}.*
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.filename(name)) LIKE auth.uid()::text || '%'
            -- Oder Equipment-Fotos (Bucket-Level, Detail-Check über RLS der equipment-Tabelle)
            OR (storage.foldername(name))[1] = 'equipment'
        )
    );

-- Update: gleiche Regeln wie Insert
CREATE POLICY "user_photos_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'user-photos'
        AND (
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.filename(name)) LIKE auth.uid()::text || '%'
            OR (storage.foldername(name))[1] = 'equipment'
        )
    );

-- Löschen: gleiche Regeln
CREATE POLICY "user_photos_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'user-photos'
        AND (
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.filename(name)) LIKE auth.uid()::text || '%'
            OR (storage.foldername(name))[1] = 'equipment'
        )
    );

-- ============================================================
-- 5. Bestehende photo_url-Daten in equipment_photos migrieren
-- ============================================================
-- Falls equipment.photo_url kommaseparierte URLs enthält,
-- diese in die neue equipment_photos Tabelle aufteilen

DO $$
DECLARE
    rec RECORD;
    url TEXT;
    idx INTEGER;
BEGIN
    FOR rec IN
        SELECT id, photo_url FROM equipment
        WHERE photo_url IS NOT NULL AND photo_url != ''
    LOOP
        idx := 0;
        FOREACH url IN ARRAY string_to_array(rec.photo_url, ',')
        LOOP
            url := TRIM(url);
            IF url != '' THEN
                INSERT INTO equipment_photos (equipment_id, photo_url, sort_order)
                VALUES (rec.id, url, idx)
                ON CONFLICT DO NOTHING;
                idx := idx + 1;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ Bestehende Equipment-Fotos migriert';
END $$;

-- ============================================================
-- 6. Bestehende SAIL_MEASUREMENT-Daten aus notes migrieren
-- ============================================================
-- Falls equipment.notes mit "SAIL_MEASUREMENT:" beginnt,
-- JSON parsen und in sail_measurements Tabelle einfügen

DO $$
DECLARE
    rec RECORD;
    json_text TEXT;
    sail_data JSONB;
    sail_type_val TEXT;
BEGIN
    FOR rec IN
        SELECT id, notes FROM equipment
        WHERE notes LIKE 'SAIL_MEASUREMENT:%'
    LOOP
        json_text := SUBSTRING(rec.notes FROM 18);  -- nach "SAIL_MEASUREMENT:"
        BEGIN
            sail_data := json_text::jsonb;
            sail_type_val := COALESCE(sail_data->>'sailType', sail_data->>'sail_type', 'grosssegel');

            INSERT INTO sail_measurements (
                equipment_id, sail_type, sail_number, notes,
                gs_p, gs_e, gs_e1, gs_a, gs_g, gs_al,
                gs_rb, gs_ru, gs_cb, gs_cu, gs_r1, gs_r2,
                gs_unterliekstau, gs_vorliekstau, gs_schothornrutscher, gs_mastrutscher,
                gs_einleinenreff, gs_weicher_fussteil, gs_loses_unterliek, gs_segelzeichen, gs_segelnummer, gs_farbe,
                vs_i, vs_i2, vs_vst, vs_j, vs_j2,
                vs_vl, vs_al1, vs_al2, vs_t1, vs_t2, vs_w, vs_q, vs_k,
                vs_h, vs_reffanlage, vs_vorliekstau,
                vs_rollreff, vs_fenster, vs_uv_schutz, vs_position, vs_farbe,
                gk_luff_length, gk_leech_length, gk_foot_length, gk_mid_width, gk_tack_height,
                gk_material, gk_farbe
            ) VALUES (
                rec.id, sail_type_val,
                COALESCE(sail_data->>'sailNumber', sail_data->>'sail_number', ''),
                COALESCE(sail_data->>'notes', ''),
                -- Großsegel
                (sail_data->>'gsP')::numeric, (sail_data->>'gsE')::numeric,
                (sail_data->>'gsE1')::numeric, (sail_data->>'gsA')::numeric,
                (sail_data->>'gsG')::numeric, (sail_data->>'gsAL')::numeric,
                (sail_data->>'gsRB')::numeric, (sail_data->>'gsRU')::numeric,
                (sail_data->>'gsCB')::numeric, (sail_data->>'gsCU')::numeric,
                (sail_data->>'gsR1')::numeric, (sail_data->>'gsR2')::numeric,
                COALESCE(sail_data->>'gsUnterliekstau', ''),
                COALESCE(sail_data->>'gsVorliekstau', ''),
                COALESCE(sail_data->>'gsSchothornrutscher', ''),
                COALESCE(sail_data->>'gsMastrutscher', ''),
                COALESCE((sail_data->>'gsEinleinenreff')::boolean, false),
                COALESCE((sail_data->>'gsWeicherFussteil')::boolean, false),
                COALESCE((sail_data->>'gsLosesUnterliek')::boolean, false),
                COALESCE((sail_data->>'gsSegelzeichen')::boolean, false),
                COALESCE((sail_data->>'gsSegelnummer')::boolean, false),
                COALESCE(sail_data->>'gsFarbe', ''),
                -- Vorsegel
                (sail_data->>'vsI')::numeric, (sail_data->>'vsI2')::numeric,
                (sail_data->>'vsVST')::numeric, (sail_data->>'vsJ')::numeric,
                (sail_data->>'vsJ2')::numeric,
                (sail_data->>'vsVL')::numeric, (sail_data->>'vsAL1')::numeric,
                (sail_data->>'vsAL2')::numeric, (sail_data->>'vsT1')::numeric,
                (sail_data->>'vsT2')::numeric, (sail_data->>'vsW')::numeric,
                (sail_data->>'vsQ')::numeric, (sail_data->>'vsK')::numeric,
                (sail_data->>'vsH')::numeric,
                COALESCE(sail_data->>'vsReffanlage', ''),
                COALESCE(sail_data->>'vsVorliekstau', ''),
                COALESCE((sail_data->>'vsRollreff')::boolean, false),
                COALESCE((sail_data->>'vsFenster')::boolean, false),
                COALESCE((sail_data->>'vsUvSchutz')::boolean, false),
                COALESCE(sail_data->>'vsPosition', ''),
                COALESCE(sail_data->>'vsFarbe', ''),
                -- Gennaker/Code0
                (sail_data->>'gkLuffLength')::numeric, (sail_data->>'gkLeechLength')::numeric,
                (sail_data->>'gkFootLength')::numeric, (sail_data->>'gkMidWidth')::numeric,
                (sail_data->>'gkTackHeight')::numeric,
                COALESCE(sail_data->>'gkMaterial', ''),
                COALESCE(sail_data->>'gkFarbe', '')
            )
            ON CONFLICT DO NOTHING;

            -- Notes-Feld bereinigen
            UPDATE equipment SET notes = '' WHERE id = rec.id;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Warnung: Konnte Segel-Daten für Equipment % nicht migrieren: %', rec.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '✅ Bestehende Segel-Maßblätter migriert';
END $$;

-- ============================================================
-- Fertig
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 028 abgeschlossen';
    RAISE NOTICE '  • sail_measurements Tabelle erstellt';
    RAISE NOTICE '  • equipment_photos Tabelle erstellt (max 5 pro Item)';
    RAISE NOTICE '  • profiles.avatar_url Spalte sichergestellt';
    RAISE NOTICE '  • Storage Bucket user-photos mit Policies erstellt';
    RAISE NOTICE '  • Bestehende Daten migriert';
END $$;
