-- ============================================================
-- Migration 049: snapshot_equipment Date-Arithmetik fixen
-- ============================================================
-- CURRENT_DATE - some_date in Postgres gibt direkt einen Integer (Tage),
-- nicht ein Interval. Daher schlug EXTRACT(EPOCH FROM …) mit
-- "function pg_catalog.extract(unknown, integer) does not exist" fehl.
-- Wir nutzen das Tages-Delta direkt.
-- ============================================================

CREATE OR REPLACE FUNCTION public.snapshot_equipment(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Equipment-Anzahl je Kategorie
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'equipment_by_category', COALESCE(category, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM equipment GROUP BY category
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    -- Top-Hersteller je Kategorie (sekundäre Dimension)
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, dimension_secondary, metric_count, metric_value)
    SELECT d, 'equipment_by_manufacturer', COALESCE(category, 'unknown'),
           COALESCE(NULLIF(manufacturer, ''), 'unknown'),
           COUNT(*)::int, COUNT(*)::numeric
      FROM equipment GROUP BY category, manufacturer
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    -- Wartungs-Auffälligkeit: Equipment mit überfälligem next_maintenance_date.
    -- (CURRENT_DATE - next_maintenance_date::date) ist bereits ein Integer (Tage).
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value, metadata)
    SELECT d, 'equipment_overdue_by_category', COALESCE(category, 'unknown'),
           COUNT(*)::int, COUNT(*)::numeric,
           jsonb_build_object(
               'avg_overdue_days',
               ROUND(AVG((CURRENT_DATE - next_maintenance_date::date))::numeric, 1)
           )
      FROM equipment
     WHERE next_maintenance_date IS NOT NULL
       AND next_maintenance_date::date < CURRENT_DATE
     GROUP BY category
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count,
            metric_value = EXCLUDED.metric_value,
            metadata     = EXCLUDED.metadata;

    -- Equipment-Dichte je Bootstyp (Anzahl Items pro Boot je Typ)
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'equipment_density_by_boattype',
           COALESCE(b.boat_type, 'unknown'),
           COUNT(e.*)::int,
           ROUND((COUNT(e.*)::numeric / NULLIF(COUNT(DISTINCT b.id), 0)), 2)
      FROM boats b LEFT JOIN equipment e ON e.boat_id = b.id
     GROUP BY b.boat_type
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
END $$;

-- Initialer Snapshot mit der gefixten Funktion
SELECT public.generate_market_snapshot(CURRENT_DATE);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 049: snapshot_equipment fixed + Snapshot erzeugt';
END $$;
