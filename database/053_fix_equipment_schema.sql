-- Migration 053: Equipment-Tabelle auf englische Spaltennamen & TEXT-Kategorie umstellen
-- Problem: Code nutzt englische Category-Werte ('engine', 'electrical', ...) und
--          neue Spaltennamen (installation_date, last_maintenance_date, ...),
--          aber die ursprüngliche DB hat ENUM-Kategorien (deutsch) und andere Spaltennamen.
-- Lösung:  (1) category ENUM → TEXT, bestehende dt. Werte → engl. mappen
--          (2) Spalten umbenennen / hinzufügen falls noch alte Namen vorhanden
--          (3) Alle Schritte sind idempotent (IF EXISTS / IF NOT EXISTS)

-- ============================================================
-- 1. category-Spalte: ENUM → TEXT (falls noch ENUM)
-- ============================================================

-- Temporäre TEXT-Spalte anlegen, befüllen, alte Spalte löschen, umbenennen
DO $$
BEGIN
  -- Nur ausführen wenn category noch ENUM-Typ ist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'equipment'
      AND column_name  = 'category'
      AND data_type    = 'USER-DEFINED'
  ) THEN
    -- Neue TEXT-Spalte
    ALTER TABLE equipment ADD COLUMN category_text TEXT;

    -- Deutsche ENUM-Werte auf englische Werte mappen
    UPDATE equipment SET category_text = CASE category::TEXT
      WHEN 'antrieb'        THEN 'engine'
      WHEN 'elektrik'       THEN 'electrical'
      WHEN 'navigation'     THEN 'navigation'
      WHEN 'sicherheit'     THEN 'safety'
      WHEN 'kommunikation'  THEN 'communication'
      WHEN 'rigg'           THEN 'rigging'
      WHEN 'rumpf'          THEN 'hull'
      WHEN 'deck'           THEN 'deck'
      WHEN 'anker'          THEN 'anchor'
      WHEN 'segel'          THEN 'rigging'
      WHEN 'beleuchtung'    THEN 'electrical'
      WHEN 'heizung'        THEN 'other'
      WHEN 'kuehlung'       THEN 'engine'
      WHEN 'entertainment'  THEN 'other'
      WHEN 'tender'         THEN 'deck'
      WHEN 'werkzeug'       THEN 'other'
      WHEN 'reinigung'      THEN 'other'
      WHEN 'sanitaer'       THEN 'other'
      WHEN 'sonstiges'      THEN 'other'
      ELSE 'other'
    END;

    -- Alte ENUM-Spalte löschen, neue umbenennen
    ALTER TABLE equipment DROP COLUMN category;
    ALTER TABLE equipment RENAME COLUMN category_text TO category;

    -- NOT NULL Constraint setzen
    UPDATE equipment SET category = 'other' WHERE category IS NULL;
    ALTER TABLE equipment ALTER COLUMN category SET NOT NULL;
    ALTER TABLE equipment ALTER COLUMN category SET DEFAULT 'other';

    RAISE NOTICE 'category ENUM → TEXT konvertiert';
  ELSE
    RAISE NOTICE 'category ist bereits TEXT – kein Umbau nötig';
  END IF;
END $$;

-- ============================================================
-- 2. Spaltennamen angleichen (alte Namen → neue Namen)
-- ============================================================

-- purchase_date → installation_date
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='equipment' AND column_name='purchase_date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='equipment' AND column_name='installation_date')
  THEN
    ALTER TABLE equipment RENAME COLUMN purchase_date TO installation_date;
    RAISE NOTICE 'purchase_date → installation_date umbenannt';
  END IF;
END $$;

-- warranty_until → warranty_expiry
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='equipment' AND column_name='warranty_until')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='equipment' AND column_name='warranty_expiry')
  THEN
    ALTER TABLE equipment RENAME COLUMN warranty_until TO warranty_expiry;
    RAISE NOTICE 'warranty_until → warranty_expiry umbenannt';
  END IF;
END $$;

-- maintenance_interval_months → maintenance_cycle_years (Werte durch 12 teilen)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='equipment' AND column_name='maintenance_interval_months')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='equipment' AND column_name='maintenance_cycle_years')
  THEN
    ALTER TABLE equipment ADD COLUMN maintenance_cycle_years INTEGER;
    UPDATE equipment
      SET maintenance_cycle_years = GREATEST(1, ROUND(maintenance_interval_months::numeric / 12)::integer)
      WHERE maintenance_interval_months IS NOT NULL;
    ALTER TABLE equipment DROP COLUMN maintenance_interval_months;
    RAISE NOTICE 'maintenance_interval_months → maintenance_cycle_years konvertiert';
  END IF;
END $$;

-- last_maintenance → last_maintenance_date
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='equipment' AND column_name='last_maintenance')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='equipment' AND column_name='last_maintenance_date')
  THEN
    ALTER TABLE equipment RENAME COLUMN last_maintenance TO last_maintenance_date;
    RAISE NOTICE 'last_maintenance → last_maintenance_date umbenannt';
  END IF;
END $$;

-- next_maintenance → next_maintenance_date
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='equipment' AND column_name='next_maintenance')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='equipment' AND column_name='next_maintenance_date')
  THEN
    ALTER TABLE equipment RENAME COLUMN next_maintenance TO next_maintenance_date;
    RAISE NOTICE 'next_maintenance → next_maintenance_date umbenannt';
  END IF;
END $$;

-- ============================================================
-- 3. Fehlende Spalten hinzufügen (falls noch nicht vorhanden)
-- ============================================================
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS installation_date    DATE,
  ADD COLUMN IF NOT EXISTS warranty_expiry      DATE,
  ADD COLUMN IF NOT EXISTS maintenance_cycle_years INTEGER,
  ADD COLUMN IF NOT EXISTS last_maintenance_date   DATE,
  ADD COLUMN IF NOT EXISTS next_maintenance_date   DATE;

-- ============================================================
-- 4. RLS-Policy für INSERT sicherstellen
-- ============================================================
-- Sicherheitshalber vorhandene Policy neu erstellen
DROP POLICY IF EXISTS "Users can insert equipment for own boats" ON equipment;
CREATE POLICY "Users can insert equipment for own boats" ON equipment
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM boats
      WHERE boats.id = equipment.boat_id
        AND boats.owner_id = auth.uid()
    )
  );

-- UPDATE Policy ebenfalls absichern
DROP POLICY IF EXISTS "Users can update own equipment" ON equipment;
CREATE POLICY "Users can update own equipment" ON equipment
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM boats
      WHERE boats.id = equipment.boat_id
        AND boats.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM boats
      WHERE boats.id = equipment.boat_id
        AND boats.owner_id = auth.uid()
    )
  );
