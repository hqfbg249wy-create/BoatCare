-- ============================================================
-- Migration 124: Snapshot-Crash "ON CONFLICT ... cannot affect row
--                a second time" beheben
-- ============================================================
-- Ursache: Der UNIQUE-Constraint auf market_snapshots ist NULLS NOT
-- DISTINCT. Die Snapshot-INSERTs gruppierten aber nach der ROHEN Spalte
-- (z.B. GROUP BY category) und bildeten den dimension_key erst im SELECT
-- via COALESCE(category,'unknown'). Existieren in den Daten sowohl NULL
-- als auch der Literalwert 'unknown' (bei 4900+ Providern quasi sicher),
-- erzeugt ein einziger INSERT zwei Quellzeilen mit identischem
-- Konflikt-Key → Postgres bricht mit
--   "ON CONFLICT DO UPDATE command cannot affect row a second time" ab.
-- Dadurch schlug generate_market_snapshot() komplett fehl → die
-- Marktanalyse blieb auf dem letzten funktionierenden Snapshot eingefroren.
--
-- Fix: In JEDEM gruppierten INSERT nach dem exakten Key-Ausdruck
-- (COALESCE/NULLIF) gruppieren, sodass NULL und 'unknown' zu EINER Gruppe
-- verschmelzen und die Konflikt-Keys pro INSERT garantiert eindeutig sind.
--
-- Idempotent (CREATE OR REPLACE). Am Ende wird ein frischer Snapshot für
-- heute erzeugt.
-- ============================================================

-- 1) User & Boote
CREATE OR REPLACE FUNCTION public.snapshot_users(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'users_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM profiles
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'users_by_role', COALESCE(role, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM profiles GROUP BY COALESCE(role, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'boats_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM boats
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'boats_by_type', COALESCE(boat_type, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM boats GROUP BY COALESCE(boat_type, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
END $$;

-- 2) Equipment
CREATE OR REPLACE FUNCTION public.snapshot_equipment(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'equipment_by_category', COALESCE(category, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM equipment GROUP BY COALESCE(category, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, dimension_secondary, metric_count, metric_value)
    SELECT d, 'equipment_by_manufacturer',
           COALESCE(category, 'unknown'),
           COALESCE(NULLIF(manufacturer, ''), 'unknown'),
           COUNT(*)::int, COUNT(*)::numeric
      FROM equipment
     GROUP BY COALESCE(category, 'unknown'), COALESCE(NULLIF(manufacturer, ''), 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

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
     GROUP BY COALESCE(category, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count,
            metric_value = EXCLUDED.metric_value,
            metadata     = EXCLUDED.metadata;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'equipment_density_by_boattype',
           COALESCE(b.boat_type, 'unknown'),
           COUNT(e.*)::int,
           ROUND((COUNT(e.*)::numeric / NULLIF(COUNT(DISTINCT b.id), 0)), 2)
      FROM boats b LEFT JOIN equipment e ON e.boat_id = b.id
     GROUP BY COALESCE(b.boat_type, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
END $$;

-- 3) Provider
CREATE OR REPLACE FUNCTION public.snapshot_providers(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'providers_total', 'all', COUNT(*)::int, COUNT(*)::numeric FROM service_providers
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'providers_by_category', COALESCE(category, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM service_providers GROUP BY COALESCE(category, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'providers_by_country', COALESCE(country, 'unknown'), COUNT(*)::int, COUNT(*)::numeric
      FROM service_providers GROUP BY COALESCE(country, 'unknown')
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;

    INSERT INTO market_snapshots (snapshot_date, metric_type, dimension_key, metric_count, metric_value)
    SELECT d, 'shops_active_total', 'all', COUNT(*)::int, COUNT(*)::numeric
      FROM service_providers WHERE is_shop_active = true
    ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
        SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
END $$;

-- 4) Commerce (Bestellungen & Reviews)
--    Im Repo ohne GROUP BY, aber die Live-DB warf hier den ON-CONFLICT-Crash
--    → sie enthielt eine abweichende, gruppierte Fassung. Wir setzen die
--    Funktion hart auf eine kollisionsfreie Version zurück. Jede gruppierte
--    Zusatz-Metrik gruppiert nach dem COALESCE-Key.
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
        SELECT d, 'reviews_avg_rating', 'all', COUNT(*)::int, ROUND(AVG(rating)::numeric, 2)
          FROM reviews
        ON CONFLICT (snapshot_date, metric_type, dimension_key, dimension_secondary) DO UPDATE
            SET metric_count = EXCLUDED.metric_count, metric_value = EXCLUDED.metric_value;
    END IF;
END $$;

-- 5) Sammel-Funktion hart auf die vier bekannten Funktionen zurücksetzen.
--    Die Live-Fassung rief offenbar eine zusätzliche, gruppierte Snapshot-
--    Funktion auf, die weiter crashte und die ganze Transaktion zurückrollte.
CREATE OR REPLACE FUNCTION public.generate_market_snapshot(d DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM snapshot_users(d);
    PERFORM snapshot_equipment(d);
    PERFORM snapshot_providers(d);
    PERFORM snapshot_commerce(d);
END $$;

-- 6) Alt-Zeilen von heute entfernen (falls ein halb gelaufener Run Reste
--    hinterließ) und frischen Snapshot erzeugen — jetzt ohne Crash.
DELETE FROM public.market_snapshots WHERE snapshot_date = CURRENT_DATE;
SELECT public.generate_market_snapshot(CURRENT_DATE);

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 124: Snapshot-Funktionen dedup-sicher + heutiger Snapshot erzeugt.';
END $$;
