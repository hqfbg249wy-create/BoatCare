-- ============================================================
-- Migration 050: Snapshot-Duplikate beseitigen + Constraint härten
-- ============================================================
-- Postgres behandelt NULL in UNIQUE-Constraints standardmäßig als
-- "distinct" → ON CONFLICT greift bei dimension_secondary IS NULL nie
-- und jeder erneute snapshot-Run legt eine neue Zeile an. Auf der
-- Marktanalyse-Page wurden so alle Werte mit jeder weiteren Ausführung
-- mehrfach gezählt.
--
-- Fix:
--   1) Duplikate je (snapshot_date, metric_type, dimension_key,
--      dimension_secondary) auf eine Zeile zusammenfassen.
--   2) Bestehenden UNIQUE-Constraint fallen lassen.
--   3) Neu anlegen mit NULLS NOT DISTINCT (Postgres 15+).
-- ============================================================

-- 1) Duplikate dedupen — jüngste Zeile pro Schlüssel behalten
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY snapshot_date, metric_type, dimension_key, dimension_secondary
               ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM public.market_snapshots
)
DELETE FROM public.market_snapshots
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Alten Constraint und alle gleichnamigen Indices droppen
ALTER TABLE public.market_snapshots
    DROP CONSTRAINT IF EXISTS market_snapshots_snapshot_date_metric_type_dimension_key_d_key;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.market_snapshots'::regclass
           AND contype  = 'u'
    LOOP
        EXECUTE 'ALTER TABLE public.market_snapshots DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 3) Neuer Constraint, der NULL als gleichwertig behandelt
ALTER TABLE public.market_snapshots
    ADD CONSTRAINT market_snapshots_unique_per_day
    UNIQUE NULLS NOT DISTINCT
    (snapshot_date, metric_type, dimension_key, dimension_secondary);

DO $$
DECLARE
    rows_now int;
BEGIN
    SELECT COUNT(*) INTO rows_now FROM public.market_snapshots;
    RAISE NOTICE '✅ Migration 050: Duplikate entfernt. Aktueller Bestand: % Zeilen.', rows_now;
END $$;
