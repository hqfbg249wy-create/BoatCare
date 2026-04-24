-- ============================================================
-- Migration 018: boats Tabelle – Schema mit tatsächlichen DB-Typen abgleichen
-- ============================================================
-- Problem: Die iOS App hatte folgende Spalten-/Typ-Abweichungen zur DB:
--   • Spalte "length" existiert in DB nicht → heißt "length_meters" (numeric)
--   • Spalte "year" ist bigint in DB, App erwartete TEXT
--
-- Diese Migration stellt sicher:
--   1. Spalte "length_meters" (numeric) existiert
--   2. Falls "length" (text) noch vorhanden: Daten rübermigrieren, alte Spalte entfernen
--   3. Spalte "year" ist bigint (kein TEXT)
--   4. Alle anderen Spalten vorhanden
-- ============================================================

-- 1. length_meters anlegen falls nicht vorhanden
ALTER TABLE boats ADD COLUMN IF NOT EXISTS length_meters NUMERIC(10,2);

-- 2. Falls "length" noch existiert: Werte in length_meters kopieren, dann entfernen
DO $$
DECLARE
    col_type text;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'boats' AND column_name = 'length';

    IF col_type IS NOT NULL THEN
        -- Spalte existiert → Daten rübermigrieren
        IF col_type IN ('text', 'character varying') THEN
            -- TEXT-Spalte: TRIM + Cast
            UPDATE boats
            SET length_meters = NULLIF(TRIM("length"::text), '')::numeric
            WHERE length_meters IS NULL
              AND NULLIF(TRIM("length"::text), '') IS NOT NULL;
        ELSE
            -- Bereits numerisch: direkt kopieren
            UPDATE boats
            SET length_meters = "length"::numeric
            WHERE length_meters IS NULL
              AND "length" IS NOT NULL;
        END IF;

        ALTER TABLE boats DROP COLUMN IF EXISTS "length";
        RAISE NOTICE '✅ Spalte "length" nach "length_meters" migriert und entfernt (Typ war: %)', col_type;
    ELSE
        RAISE NOTICE 'ℹ️ Spalte "length" existiert nicht – kein Handlungsbedarf';
    END IF;
END $$;

-- 3. year: Falls noch TEXT → zu bigint konvertieren
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'boats'
          AND column_name = 'year'
          AND data_type IN ('text', 'character varying')
    ) THEN
        -- Leere Strings auf NULL setzen damit CAST nicht fehlschlägt
        UPDATE boats SET year = NULL WHERE TRIM(year::text) = '';
        ALTER TABLE boats ALTER COLUMN year TYPE bigint USING year::bigint;
        RAISE NOTICE '✅ Spalte "year" von TEXT zu bigint konvertiert';
    ELSE
        RAISE NOTICE 'ℹ️ Spalte "year" ist bereits numerisch';
    END IF;
END $$;

-- 4. Sicherstellen dass boat_type existiert (Fallback aus Migration 017)
ALTER TABLE boats ADD COLUMN IF NOT EXISTS boat_type    TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS manufacturer TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS model        TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS engine       TEXT NOT NULL DEFAULT '';
ALTER TABLE boats ADD COLUMN IF NOT EXISTS home_port    TEXT NOT NULL DEFAULT '';

-- 5. RLS sicherstellen
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own boats" ON boats;
CREATE POLICY "Users can manage own boats"
    ON boats
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 6. Verifikation: finales Schema ausgeben
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'boats'
ORDER BY ordinal_position;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 018 abgeschlossen – boats Schema ist korrekt';
END $$;
