-- Migration 032: Equipment-Insights Views für Provider Portal
-- Erweitert Marktanalyse um Modelle, Installationsalter und Wartungsstatus

-- ============================================================
-- 1. Equipment-Modelle pro Kategorie (anonymisiert, aggregiert)
-- ============================================================
CREATE OR REPLACE VIEW equipment_model_stats AS
SELECT
    COALESCE(NULLIF(TRIM(category), ''), 'other') AS category,
    COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt') AS manufacturer,
    COALESCE(NULLIF(TRIM(model), ''), 'Unbekannt') AS model,
    COALESCE(NULLIF(TRIM(name), ''), 'Unbenannt') AS equipment_name,
    COUNT(*) AS count
FROM equipment
WHERE model IS NOT NULL AND TRIM(model) != ''
GROUP BY 1, 2, 3, 4
ORDER BY count DESC;

-- ============================================================
-- 2. Installationsalter-Verteilung (in Jahren, anonymisiert)
-- ============================================================
CREATE OR REPLACE VIEW equipment_age_stats AS
SELECT
    COALESCE(NULLIF(TRIM(category), ''), 'other') AS category,
    CASE
        WHEN installation_date IS NULL THEN 'unbekannt'
        WHEN DATE_PART('year', AGE(CURRENT_DATE, installation_date)) < 1 THEN '< 1 Jahr'
        WHEN DATE_PART('year', AGE(CURRENT_DATE, installation_date)) < 3 THEN '1-3 Jahre'
        WHEN DATE_PART('year', AGE(CURRENT_DATE, installation_date)) < 5 THEN '3-5 Jahre'
        WHEN DATE_PART('year', AGE(CURRENT_DATE, installation_date)) < 10 THEN '5-10 Jahre'
        ELSE '10+ Jahre'
    END AS age_group,
    COUNT(*) AS count
FROM equipment
GROUP BY 1, 2
ORDER BY category,
    CASE age_group
        WHEN '< 1 Jahr' THEN 1
        WHEN '1-3 Jahre' THEN 2
        WHEN '3-5 Jahre' THEN 3
        WHEN '5-10 Jahre' THEN 4
        WHEN '10+ Jahre' THEN 5
        ELSE 6
    END;

-- ============================================================
-- 3. Wartungsstatus-Übersicht (anonymisiert)
-- ============================================================
CREATE OR REPLACE VIEW equipment_maintenance_stats AS
SELECT
    COALESCE(NULLIF(TRIM(category), ''), 'other') AS category,
    COUNT(*) AS total,
    COUNT(last_maintenance_date) AS with_maintenance,
    COUNT(*) - COUNT(last_maintenance_date) AS without_maintenance,
    COUNT(CASE WHEN next_maintenance_date IS NOT NULL AND next_maintenance_date < CURRENT_DATE THEN 1 END) AS overdue,
    COUNT(CASE WHEN next_maintenance_date IS NOT NULL AND next_maintenance_date >= CURRENT_DATE AND next_maintenance_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END) AS due_soon,
    COUNT(CASE WHEN next_maintenance_date IS NOT NULL AND next_maintenance_date > CURRENT_DATE + INTERVAL '90 days' THEN 1 END) AS up_to_date,
    ROUND(AVG(
        CASE WHEN last_maintenance_date IS NOT NULL
        THEN DATE_PART('day', AGE(CURRENT_DATE, last_maintenance_date))
        END
    ))::INT AS avg_days_since_maintenance
FROM equipment
GROUP BY 1
ORDER BY total DESC;

-- ============================================================
-- 4. Erweiterte get_market_insights Funktion
-- ============================================================
CREATE OR REPLACE FUNCTION get_market_insights()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'fleet_overview', (SELECT row_to_json(f) FROM fleet_overview_stats f),
        'boat_types', (SELECT COALESCE(json_agg(row_to_json(bt)), '[]'::json) FROM (SELECT * FROM boat_type_stats LIMIT 20) bt),
        'boat_manufacturers', (SELECT COALESCE(json_agg(row_to_json(bm)), '[]'::json) FROM (SELECT * FROM boat_manufacturer_stats LIMIT 20) bm),
        'equipment_categories', (SELECT COALESCE(json_agg(row_to_json(ec)), '[]'::json) FROM (SELECT * FROM equipment_category_stats LIMIT 20) ec),
        'equipment_manufacturers', (SELECT COALESCE(json_agg(row_to_json(em)), '[]'::json) FROM (SELECT * FROM equipment_manufacturer_stats LIMIT 20) em),
        'equipment_models', (SELECT COALESCE(json_agg(row_to_json(md)), '[]'::json) FROM (SELECT * FROM equipment_model_stats LIMIT 30) md),
        'equipment_age', (SELECT COALESCE(json_agg(row_to_json(ag)), '[]'::json) FROM (SELECT * FROM equipment_age_stats) ag),
        'equipment_maintenance', (SELECT COALESCE(json_agg(row_to_json(mt)), '[]'::json) FROM (SELECT * FROM equipment_maintenance_stats) mt)
    ) INTO result;

    RETURN result;
END;
$$;

-- ============================================================
SELECT 'Migration 032 erfolgreich ausgefuehrt' AS status;
