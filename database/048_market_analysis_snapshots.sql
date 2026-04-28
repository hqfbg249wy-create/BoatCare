-- ============================================================
-- Migration 048: Marktanalyse-Snapshots + Aggregat-Funktionen
-- ============================================================
-- Speichert tägliche Snapshots aggregierter Markt-Kennzahlen, damit der
-- Admin Trends und Auffälligkeiten erkennen kann (z.B. Wartungs-
-- häufigkeiten je Bootstyp, Provider-Wachstum pro Region etc.).
--
-- Design:
--   * Eine generische Tabelle market_snapshots mit metric_type +
--     dimension_key/_secondary + numeric value, statt vieler Einzeltabellen.
--   * Ein Set kleiner snapshot_*-Funktionen pro Bereich, alle vereint
--     in generate_market_snapshot().
--   * RPC-Wrapper admin_run_market_snapshot() für manuelle Ausführung
--     aus dem Admin-Panel.
--   * Auswertung über admin_get_market_trend(metric, dim?, days?).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.market_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    metric_type         TEXT NOT NULL,
    dimension_key       TEXT,
    dimension_secondary TEXT,
    metric_value        NUMERIC NOT NULL DEFAULT 0,
    metric_count        INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ein metric/dim-Tupel pro Tag → idempotente Snapshots
    UNIQUE (snapshot_date, metric_type, dimension_key, dimension_secondary)
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_metric_date
    ON public.market_snapshots (metric_type, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_date
    ON public.market_snapshots (snapshot_date DESC);

-- RLS: nur Admins lesen, nur SECURITY DEFINER-Funktionen schreiben
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_snapshots_admin_read" ON public.market_snapshots;
CREATE POLICY "market_snapshots_admin_read" ON public.market_snapshots
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role IN ('admin', 'admin_readonly'))
    );

-- ============================================================
-- Snapshot-Funktionen (alle idempotent via ON CONFLICT)
-- ============================================================

-- 1) User & Boote – Wachstum auf Plattform-Ebene
CREATE OR REPLACE FUNCTION public.snapshot_users(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'users_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM profiles
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'users_by_role', role, COUNT(*)::int, COUNT(*)::numeric FROM profiles GROUP BY role
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'boats_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM boats
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'boats_by_type', COALESCE(boat_type, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM boats GROUP BY boat_type
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
END $$;

-- 2) Equipment – wo wird viel gewartet, welche Hersteller dominieren
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

    -- Wartungs-Auffälligkeit: Equipment mit überfälligem next_maintenance_date
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value, metadata)
    SELECT d, 'equipment_overdue_by_category', COALESCE(category, 'unknown'),
           COUNT(*)::int, COUNT(*)::numeric,
           jsonb_build_object('avg_overdue_days',
               ROUND(AVG(EXTRACT(EPOCH FROM (CURRENT_DATE - next_maintenance_date::date))/86400), 1))
      FROM equipment
     WHERE next_maintenance_date IS NOT NULL
       AND next_maintenance_date::date < CURRENT_DATE
     GROUP BY category
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count,
            metric_value = EXCLUDED.metric_value,
            metadata     = EXCLUDED.metadata;

    -- Equipment-Dichte je Bootstyp (Median Anzahl pro Boot je Typ)
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

-- 3) Provider – Verteilung & Aktivität
CREATE OR REPLACE FUNCTION public.snapshot_providers(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'providers_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM service_providers
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'providers_by_category', COALESCE(category, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM service_providers GROUP BY category
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'providers_by_country', COALESCE(country, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM service_providers GROUP BY country
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'shops_active_total', 'all', COUNT(*)::int, COUNT(*)::numeric
      FROM service_providers WHERE is_shop_active = true
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
END $$;

-- 4) Bestellungen & Reviews – Marktdynamik (defensiv: Tabellen optional)
CREATE OR REPLACE FUNCTION public.snapshot_commerce(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
        INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
        SELECT d, 'orders_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM orders
        ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
            SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

        INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
        SELECT d, 'orders_last_30d', 'count', COUNT(*)::int, COUNT(*)::numeric
          FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
            SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reviews') THEN
        INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
        SELECT d, 'reviews_avg_rating', 'all', COUNT(*)::int,
               ROUND(AVG(rating)::numeric, 2)
          FROM reviews
        ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
            SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
    END IF;
END $$;

-- ============================================================
-- Sammel-Snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_market_snapshot(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM snapshot_users(d);
    PERFORM snapshot_equipment(d);
    PERFORM snapshot_providers(d);
    PERFORM snapshot_commerce(d);
END $$;

-- Admin-RPCs (Wrapper mit Auth-Check)
CREATE OR REPLACE FUNCTION public.admin_run_market_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_rows int;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'forbidden: full admin only';
    END IF;
    PERFORM generate_market_snapshot(CURRENT_DATE);
    SELECT COUNT(*) INTO total_rows FROM market_snapshots WHERE snapshot_date = CURRENT_DATE;
    RETURN jsonb_build_object('snapshot_date', CURRENT_DATE, 'rows', total_rows);
END $$;

REVOKE ALL ON FUNCTION public.admin_run_market_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_run_market_snapshot() TO authenticated;

-- Trend-Abfrage: liefert Snapshot-Werte einer Metrik über die letzten N Tage
CREATE OR REPLACE FUNCTION public.admin_get_market_trend(
    p_metric TEXT,
    p_days   INT DEFAULT 90,
    p_dim    TEXT DEFAULT NULL
)
RETURNS TABLE (
    snapshot_date DATE,
    dimension_key TEXT,
    dimension_secondary TEXT,
    metric_count INT,
    metric_value NUMERIC,
    metadata JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','admin_readonly')) THEN
        RAISE EXCEPTION 'forbidden: admin only';
    END IF;

    RETURN QUERY
        SELECT s.snapshot_date, s.dimension_key, s.dimension_secondary,
               s.metric_count, s.metric_value, s.metadata
          FROM market_snapshots s
         WHERE s.metric_type = p_metric
           AND s.snapshot_date >= CURRENT_DATE - (p_days || ' days')::interval
           AND (p_dim IS NULL OR s.dimension_key = p_dim)
         ORDER BY s.snapshot_date, s.dimension_key, s.dimension_secondary;
END $$;

REVOKE ALL ON FUNCTION public.admin_get_market_trend(TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_market_trend(TEXT, INT, TEXT) TO authenticated;

-- ============================================================
-- Optional: täglicher Cron-Job (pg_cron)
-- ============================================================
-- Nach dem Aktivieren der pg_cron-Extension im Supabase-Dashboard
-- (Database → Extensions → pg_cron) folgendes ausführen:
--
--   SELECT cron.schedule(
--     'market-snapshot-daily',
--     '0 3 * * *',                      -- jede Nacht 03:00
--     $$ SELECT public.generate_market_snapshot(CURRENT_DATE); $$
--   );
--
-- Status prüfen:    SELECT * FROM cron.job;
-- Wieder löschen:   SELECT cron.unschedule('market-snapshot-daily');
-- ============================================================

-- Initialer Snapshot, damit das Dashboard sofort etwas anzeigt
SELECT public.generate_market_snapshot(CURRENT_DATE);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 048: market_snapshots aktiv + erster Snapshot erzeugt';
END $$;
