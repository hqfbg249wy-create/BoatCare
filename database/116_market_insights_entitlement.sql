-- ============================================================
-- Migration 116: Marktanalyse nur für berechtigte Provider
-- ============================================================
-- Nur ZAHLENDE (Enterprise-Abo) ODER von uns AKTIV FREIGESCHALTETE
-- (admin_grant) Provider dürfen die Marktanalyse-Daten sehen. Bisher waren
-- die Views/RPCs sogar anon-offen. Erzwungen jetzt auf DB-Ebene über den
-- Helfer provider_can_analytics() — spiegelt useFeatureAccess.isEnterprise.
-- Kein Frontend-Redeploy nötig (das UI gated die Seite ohnehin).
-- ============================================================

-- 1) Berechtigungs-Helfer: Enterprise-Abo ODER admin_grant (freigeschaltet)
CREATE OR REPLACE FUNCTION public.provider_can_analytics()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_providers sp
    WHERE (
      sp.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.provider_members pm
        WHERE pm.provider_id = sp.id AND pm.user_id = auth.uid()
      )
    )
    AND (
      -- zahlendes Enterprise-Abo
      (sp.subscription_tier = 'professional'
        AND COALESCE(sp.subscription_status, 'active') = 'active'
        AND sp.subscription_plan IN ('ent_monthly', 'ent_yearly'))
      -- ODER von uns freigeschaltet (admin_grant, außer explizit nur Pro)
      OR (sp.subscription_tier = 'admin_grant'
        AND COALESCE(sp.subscription_plan, '') NOT IN ('pro_monthly', 'pro_yearly'))
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.provider_can_analytics() TO anon, authenticated;

-- 2) Stats-Views mit Gate (leere Menge, wenn nicht berechtigt)
CREATE OR REPLACE VIEW boat_type_stats AS
SELECT COALESCE(NULLIF(TRIM(boat_type), ''), 'Unbekannt') AS boat_type, COUNT(*) AS count
FROM boats
WHERE boat_type IS NOT NULL AND TRIM(boat_type) != '' AND public.provider_can_analytics()
GROUP BY COALESCE(NULLIF(TRIM(boat_type), ''), 'Unbekannt')
ORDER BY count DESC;

CREATE OR REPLACE VIEW boat_manufacturer_stats AS
SELECT COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt') AS manufacturer, COUNT(*) AS count
FROM boats
WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '' AND public.provider_can_analytics()
GROUP BY COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt')
ORDER BY count DESC;

CREATE OR REPLACE VIEW equipment_category_stats AS
SELECT COALESCE(NULLIF(TRIM(category), ''), 'other') AS category, COUNT(*) AS count
FROM equipment
WHERE category IS NOT NULL AND TRIM(category) != '' AND public.provider_can_analytics()
GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'other')
ORDER BY count DESC;

CREATE OR REPLACE VIEW equipment_manufacturer_stats AS
SELECT COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt') AS manufacturer, COUNT(*) AS count
FROM equipment
WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '' AND public.provider_can_analytics()
GROUP BY COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt')
ORDER BY count DESC;

CREATE OR REPLACE VIEW fleet_overview_stats AS
SELECT
  (SELECT COUNT(*) FROM boats) AS total_boats,
  (SELECT COUNT(DISTINCT boat_type) FROM boats WHERE boat_type IS NOT NULL AND TRIM(boat_type) != '') AS unique_boat_types,
  (SELECT COUNT(DISTINCT manufacturer) FROM boats WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '') AS unique_boat_manufacturers,
  (SELECT COUNT(*) FROM equipment) AS total_equipment,
  (SELECT COUNT(DISTINCT category) FROM equipment WHERE category IS NOT NULL AND TRIM(category) != '') AS unique_equipment_categories,
  (SELECT COUNT(DISTINCT manufacturer) FROM equipment WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '') AS unique_equipment_manufacturers
WHERE public.provider_can_analytics();

-- anon aussperren; nur authenticated (das Gate begrenzt zusätzlich auf berechtigte)
REVOKE ALL ON boat_type_stats, boat_manufacturer_stats, equipment_category_stats, equipment_manufacturer_stats, fleet_overview_stats FROM anon;
GRANT SELECT ON boat_type_stats, boat_manufacturer_stats, equipment_category_stats, equipment_manufacturer_stats, fleet_overview_stats TO authenticated;

-- 3) get_market_insights: Gate + anon aussperren
CREATE OR REPLACE FUNCTION public.get_market_insights()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result json;
BEGIN
  IF NOT public.provider_can_analytics() THEN
    RETURN NULL;
  END IF;
  SELECT json_build_object(
    'fleet_overview', (SELECT row_to_json(f) FROM public.fleet_overview_stats f),
    'boat_types', (SELECT json_agg(row_to_json(bt)) FROM (SELECT * FROM public.boat_type_stats LIMIT 20) bt),
    'boat_manufacturers', (SELECT json_agg(row_to_json(bm)) FROM (SELECT * FROM public.boat_manufacturer_stats LIMIT 20) bm),
    'equipment_categories', (SELECT json_agg(row_to_json(ec)) FROM (SELECT * FROM public.equipment_category_stats LIMIT 20) ec),
    'equipment_manufacturers', (SELECT json_agg(row_to_json(em)) FROM (SELECT * FROM public.equipment_manufacturer_stats LIMIT 20) em)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_market_insights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_insights() TO authenticated;

-- 4) get_rope_demand: Gate ergänzen (anon ist via 115 bereits gesperrt)
CREATE OR REPLACE FUNCTION public.get_rope_demand()
RETURNS TABLE (
  material text, diameter_mm numeric, end1 text, end2 text,
  req_count bigint, avg_length_m numeric, total_length_m numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    COALESCE(NULLIF(trim(material), ''), 'unbekannt') AS material,
    diameter_mm, end1, end2,
    count(*)                AS req_count,
    round(avg(length_m), 1) AS avg_length_m,
    round(sum(length_m), 1) AS total_length_m
  FROM public.rope_configurations
  WHERE public.provider_can_analytics()
  GROUP BY 1, diameter_mm, end1, end2
  ORDER BY req_count DESC, total_length_m DESC NULLS LAST
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.get_rope_demand() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rope_demand() TO authenticated;
