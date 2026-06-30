-- ============================================================
-- Migration 096: Markt-Bericht (B2B-Newsletter) + Ersatz-/Wartungs-Prognose
-- ============================================================
-- Liefert einen kompletten, periodengebundenen Markt-Report als JSONB:
--   * KPIs + Wachstum über den gewählten Zeitraum (aus market_snapshots)
--   * Ersatzzyklen je Equipment-Kategorie: Referenz-Lebensdauer
--     GEGENÜBER datenbasiertem Beobachtungswert (p75-Alter) + Prognose
--     "fällig in 12/24/36 Monaten" für BEIDE Methoden
--   * Wartungszyklen je Kategorie (Nutzerangabe vs. Referenz) + Fälligkeiten
--   * Auffälligkeiten (größte Ersatzwelle, höchste Überfälligkeit, früher
--     Ersatz vs. Referenz)
--
-- Hinweis: Austausch-/Ersatzereignisse werden nicht getrackt. Die
-- datenbasierte Ersatzprognose verwendet daher das 75.-Perzentil des
-- aktuellen Flottenalters je Kategorie als beobachteten Ersatzzyklus.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Referenztabelle: typische Lebensdauer + Wartungszyklus
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipment_lifecycle_reference (
    category                       TEXT PRIMARY KEY,
    label_de                       TEXT NOT NULL,
    expected_lifespan_years        NUMERIC NOT NULL,
    typical_maintenance_cycle_years NUMERIC NOT NULL,
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_lifecycle_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lifecycle_ref_admin_read" ON public.equipment_lifecycle_reference;
CREATE POLICY "lifecycle_ref_admin_read" ON public.equipment_lifecycle_reference
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role IN ('admin','admin_readonly')));

DROP POLICY IF EXISTS "lifecycle_ref_admin_write" ON public.equipment_lifecycle_reference;
CREATE POLICY "lifecycle_ref_admin_write" ON public.equipment_lifecycle_reference
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed (idempotent) — branchenübliche Richtwerte, im Panel später editierbar
INSERT INTO public.equipment_lifecycle_reference
    (category, label_de, expected_lifespan_years, typical_maintenance_cycle_years) VALUES
    ('engine',        'Motor / Antrieb',  15, 1),
    ('electrical',    'Elektrik',         10, 2),
    ('navigation',    'Navigation',        8, 2),
    ('safety',        'Sicherheit',        6, 1),
    ('communication', 'Kommunikation',     8, 2),
    ('rigging',       'Rigg / Segel',     12, 2),
    ('hull',          'Rumpf',            25, 3),
    ('deck',          'Deck',             20, 3),
    ('anchor',        'Anker',            20, 3),
    ('other',         'Sonstiges',        10, 2)
ON CONFLICT (category) DO NOTHING;

-- ------------------------------------------------------------
-- 2. RPC: kompletter Bericht als JSONB
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_market_report(
    p_from  DATE,
    p_to    DATE,
    p_label TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','admin_readonly')) THEN
        RAISE EXCEPTION 'forbidden: admin only';
    END IF;

    WITH
    -- aktuelle Equipment-Kennzahlen je Kategorie
    eqcat AS (
        SELECT COALESCE(NULLIF(TRIM(category),''),'other') AS category,
               COUNT(*)::int AS cnt,
               ROUND(AVG((CURRENT_DATE - installation_date)::numeric/365.25)
                     FILTER (WHERE installation_date IS NOT NULL), 1) AS avg_age_years,
               ROUND((percentile_cont(0.75) WITHIN GROUP (
                         ORDER BY (CURRENT_DATE - installation_date)::numeric/365.25)
                      FILTER (WHERE installation_date IS NOT NULL))::numeric, 1) AS p75_age_years,
               ROUND(AVG(maintenance_cycle_years::numeric)
                     FILTER (WHERE maintenance_cycle_years IS NOT NULL), 1) AS avg_maint_cycle_years,
               COUNT(*) FILTER (WHERE next_maintenance_date IS NOT NULL
                                  AND next_maintenance_date::date < CURRENT_DATE)::int AS maint_overdue,
               COUNT(*) FILTER (WHERE next_maintenance_date::date >= CURRENT_DATE
                                  AND next_maintenance_date::date < CURRENT_DATE + INTERVAL '3 months')::int  AS maint_due_3m,
               COUNT(*) FILTER (WHERE next_maintenance_date::date >= CURRENT_DATE
                                  AND next_maintenance_date::date < CURRENT_DATE + INTERVAL '6 months')::int  AS maint_due_6m,
               COUNT(*) FILTER (WHERE next_maintenance_date::date >= CURRENT_DATE
                                  AND next_maintenance_date::date < CURRENT_DATE + INTERVAL '12 months')::int AS maint_due_12m
        FROM equipment
        GROUP BY 1
    ),
    -- beobachteter Ersatzzyklus (p75-Alter) je Kategorie
    p75 AS (
        SELECT COALESCE(NULLIF(TRIM(category),''),'other') AS category,
               percentile_cont(0.75) WITHIN GROUP (
                   ORDER BY (CURRENT_DATE - installation_date)::numeric/365.25) AS p75_years
        FROM equipment WHERE installation_date IS NOT NULL
        GROUP BY 1
    ),
    -- Ersatz-Prognose: Referenz vs. datenbasiert, kumulative Fenster
    fc AS (
        SELECT cat,
               COUNT(*) FILTER (WHERE ref_date  < CURRENT_DATE)::int AS ref_overdue,
               COUNT(*) FILTER (WHERE ref_date  < CURRENT_DATE + INTERVAL '12 months' AND ref_date >= CURRENT_DATE)::int AS ref_12m,
               COUNT(*) FILTER (WHERE ref_date  < CURRENT_DATE + INTERVAL '24 months' AND ref_date >= CURRENT_DATE)::int AS ref_24m,
               COUNT(*) FILTER (WHERE ref_date  < CURRENT_DATE + INTERVAL '36 months' AND ref_date >= CURRENT_DATE)::int AS ref_36m,
               COUNT(*) FILTER (WHERE data_date < CURRENT_DATE)::int AS data_overdue,
               COUNT(*) FILTER (WHERE data_date < CURRENT_DATE + INTERVAL '12 months' AND data_date >= CURRENT_DATE)::int AS data_12m,
               COUNT(*) FILTER (WHERE data_date < CURRENT_DATE + INTERVAL '24 months' AND data_date >= CURRENT_DATE)::int AS data_24m,
               COUNT(*) FILTER (WHERE data_date < CURRENT_DATE + INTERVAL '36 months' AND data_date >= CURRENT_DATE)::int AS data_36m
        FROM (
            SELECT COALESCE(NULLIF(TRIM(e.category),''),'other') AS cat,
                   (e.installation_date + (COALESCE(r.expected_lifespan_years,10) || ' years')::interval)::date AS ref_date,
                   (e.installation_date + (GREATEST(COALESCE(p.p75_years, r.expected_lifespan_years, 10), 1) || ' years')::interval)::date AS data_date
            FROM equipment e
            LEFT JOIN equipment_lifecycle_reference r
                   ON r.category = COALESCE(NULLIF(TRIM(e.category),''),'other')
            LEFT JOIN p75 p
                   ON p.category = COALESCE(NULLIF(TRIM(e.category),''),'other')
            WHERE e.installation_date IS NOT NULL
        ) x
        GROUP BY cat
    ),
    -- Wachstum aus Snapshots (Anfang vs. Ende des Zeitraums)
    snap AS (
        SELECT m.metric_type,
               (SELECT s.metric_value FROM market_snapshots s
                 WHERE s.metric_type = m.metric_type AND s.dimension_key = 'all'
                   AND s.snapshot_date >= p_from
                 ORDER BY s.snapshot_date ASC LIMIT 1) AS start_val,
               (SELECT s.metric_value FROM market_snapshots s
                 WHERE s.metric_type = m.metric_type AND s.dimension_key = 'all'
                   AND s.snapshot_date <= p_to
                 ORDER BY s.snapshot_date DESC LIMIT 1) AS end_val
        FROM (VALUES ('users_total'),('boats_total'),('providers_total'),('shops_active_total')) m(metric_type)
    ),
    -- Nachfrage-Trend: Equipment-Bestand Anfang vs. Ende des Zeitraums.
    -- Start/Ende = erster Snapshot >= p_from bzw. letzter <= p_to (taeglich, alle Dims gleichtägig).
    dcat_dates AS (
        SELECT
            (SELECT min(snapshot_date) FROM market_snapshots
              WHERE metric_type = 'equipment_by_category' AND snapshot_date >= p_from) AS d_start,
            (SELECT max(snapshot_date) FROM market_snapshots
              WHERE metric_type = 'equipment_by_category' AND snapshot_date <= p_to)   AS d_end
    ),
    dcat AS (  -- je Kategorie
        SELECT COALESCE(s.dimension_key, e.dimension_key) AS category,
               COALESCE(s.metric_count, 0)::int AS start_cnt,
               COALESCE(e.metric_count, 0)::int AS end_cnt
        FROM (SELECT ms.dimension_key, ms.metric_count FROM market_snapshots ms, dcat_dates
               WHERE ms.metric_type = 'equipment_by_category' AND ms.snapshot_date = dcat_dates.d_start) s
        FULL JOIN (SELECT ms.dimension_key, ms.metric_count FROM market_snapshots ms, dcat_dates
                    WHERE ms.metric_type = 'equipment_by_category' AND ms.snapshot_date = dcat_dates.d_end) e
          ON e.dimension_key = s.dimension_key
    ),
    dmfg AS (  -- je Kategorie + Hersteller (Drill-down)
        SELECT COALESCE(s.dimension_key, e.dimension_key) AS category,
               COALESCE(s.dimension_secondary, e.dimension_secondary) AS manufacturer,
               COALESCE(s.metric_count, 0)::int AS start_cnt,
               COALESCE(e.metric_count, 0)::int AS end_cnt
        FROM (SELECT ms.dimension_key, ms.dimension_secondary, ms.metric_count FROM market_snapshots ms, dcat_dates
               WHERE ms.metric_type = 'equipment_by_manufacturer' AND ms.snapshot_date = dcat_dates.d_start) s
        FULL JOIN (SELECT ms.dimension_key, ms.dimension_secondary, ms.metric_count FROM market_snapshots ms, dcat_dates
                    WHERE ms.metric_type = 'equipment_by_manufacturer' AND ms.snapshot_date = dcat_dates.d_end) e
          ON e.dimension_key = s.dimension_key AND e.dimension_secondary = s.dimension_secondary
    )
    SELECT jsonb_build_object(
        'meta', jsonb_build_object(
            'label', p_label,
            'from',  p_from,
            'to',    p_to,
            'generated_at', now()
        ),
        'kpis', (
            SELECT jsonb_agg(jsonb_build_object(
                       'metric', metric_type,
                       'start', COALESCE(start_val,0),
                       'end',   COALESCE(end_val,0),
                       'delta', COALESCE(end_val,0) - COALESCE(start_val,0)
                   ) ORDER BY metric_type)
            FROM snap
        ),
        'replacement', (
            SELECT jsonb_agg(jsonb_build_object(
                       'category', c.category,
                       'label',    COALESCE(r.label_de, c.category),
                       'count',    c.cnt,
                       'avg_age_years',  c.avg_age_years,
                       'ref_lifespan',   r.expected_lifespan_years,
                       'data_lifespan',  ROUND(COALESCE(c.p75_age_years, r.expected_lifespan_years), 1),
                       'ref',  jsonb_build_object('overdue', COALESCE(f.ref_overdue,0),  'm12', COALESCE(f.ref_12m,0),  'm24', COALESCE(f.ref_24m,0),  'm36', COALESCE(f.ref_36m,0)),
                       'data', jsonb_build_object('overdue', COALESCE(f.data_overdue,0), 'm12', COALESCE(f.data_12m,0), 'm24', COALESCE(f.data_24m,0), 'm36', COALESCE(f.data_36m,0))
                   ) ORDER BY c.cnt DESC)
            FROM eqcat c
            LEFT JOIN equipment_lifecycle_reference r ON r.category = c.category
            LEFT JOIN fc f ON f.cat = c.category
            WHERE c.cnt > 0
        ),
        'maintenance', (
            SELECT jsonb_agg(jsonb_build_object(
                       'category', c.category,
                       'label',    COALESCE(r.label_de, c.category),
                       'count',    c.cnt,
                       'avg_cycle_years', c.avg_maint_cycle_years,
                       'ref_cycle_years', r.typical_maintenance_cycle_years,
                       'overdue',  c.maint_overdue,
                       'due_3m',   c.maint_due_3m,
                       'due_6m',   c.maint_due_6m,
                       'due_12m',  c.maint_due_12m
                   ) ORDER BY c.maint_overdue DESC, c.cnt DESC)
            FROM eqcat c
            LEFT JOIN equipment_lifecycle_reference r ON r.category = c.category
            WHERE c.cnt > 0
        ),
        -- Nachfrage-Trend mit Drill-down Kategorie → Hersteller
        'demand', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'category', c.category,
                       'label',    COALESCE(r.label_de, c.category),
                       'start',    c.start_cnt,
                       'end',      c.end_cnt,
                       'delta',    c.end_cnt - c.start_cnt,
                       'children', (
                           SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'manufacturer', m.manufacturer,
                                      'start', m.start_cnt,
                                      'end',   m.end_cnt,
                                      'delta', m.end_cnt - m.start_cnt
                                  ) ORDER BY (m.end_cnt - m.start_cnt) DESC, m.end_cnt DESC), '[]'::jsonb)
                           FROM dmfg m WHERE m.category = c.category
                       )
                   ) ORDER BY (c.end_cnt - c.start_cnt) DESC, c.end_cnt DESC), '[]'::jsonb)
            FROM dcat c
            LEFT JOIN equipment_lifecycle_reference r ON r.category = c.category
        ),
        -- Auffälligkeiten werden clientseitig aus replacement/maintenance abgeleitet
        'totals', jsonb_build_object(
            'equipment',         (SELECT COALESCE(SUM(cnt),0) FROM eqcat),
            'maint_overdue',     (SELECT COALESCE(SUM(maint_overdue),0) FROM eqcat),
            'maint_due_12m',     (SELECT COALESCE(SUM(maint_due_12m),0) FROM eqcat),
            'repl_ref_12m',      (SELECT COALESCE(SUM(ref_12m),0)  FROM fc),
            'repl_ref_overdue',  (SELECT COALESCE(SUM(ref_overdue),0) FROM fc),
            'repl_data_12m',     (SELECT COALESCE(SUM(data_12m),0) FROM fc)
        )
    ) INTO result;

    RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_market_report(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_market_report(DATE, DATE, TEXT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 096: equipment_lifecycle_reference + admin_market_report aktiv';
END $$;
