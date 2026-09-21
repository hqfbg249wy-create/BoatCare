-- 143_profiles_country_and_users_by_country.sql
-- Nutzer-Land erfassen (bisher nicht gespeichert) + in der Live-Marktanalyse
-- ausgeben. Historische Nutzer erscheinen als 'ohne Angabe', bis sie im Profil
-- ein Land setzen.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text;

-- admin_market_live neu definieren: zusaetzlich users_by_country + users_total.
CREATE OR REPLACE FUNCTION public.admin_market_live()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin_or_readonly() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'users_total', (SELECT count(*) FROM profiles),
    'users_by_country', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('country', co, 'count', c) ORDER BY c DESC)
      FROM (
        -- explizites Land, sonst Liefer-Land als Signal, sonst ohne Angabe
        SELECT COALESCE(NULLIF(trim(country),''), NULLIF(trim(shipping_country),''), 'ohne Angabe') co, count(*) c
        FROM profiles GROUP BY 1
      ) u
    ), '[]'::jsonb),
    'boats_by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', t, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT CASE
          WHEN lower(coalesce(boat_type,'')) ~ '(katamaran|catamaran|\mcat\M)' THEN 'Katamaran'
          WHEN lower(coalesce(boat_type,'')) ~ 'trimaran' THEN 'Trimaran'
          WHEN lower(coalesce(boat_type,'')) ~ 'trawler' THEN 'Trawler'
          WHEN lower(coalesce(boat_type,'')) ~ '(schlauch|dinghy|beiboot|\mrib\M|tender)' THEN 'Schlauchboot/Beiboot'
          WHEN lower(coalesce(boat_type,'')) ~ '(motor|mb\M|my\M)' THEN 'Motoryacht'
          WHEN lower(coalesce(boat_type,'')) ~ '(segel|sail|yacht|sy\M|slup|ketch|yawl)' THEN 'Segelyacht'
          WHEN coalesce(trim(boat_type),'') = '' THEN 'ohne Angabe'
          ELSE 'Sonstige'
        END t, count(*) c
        FROM boats GROUP BY 1
      ) x
    ), '[]'::jsonb),
    'providers_by_country', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('country', co, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT COALESCE(NULLIF(trim(country),''), 'ohne Angabe') co, count(*) c
        FROM service_providers GROUP BY 1
      ) y
    ), '[]'::jsonb),
    'overdue_total', (
      SELECT count(*) FROM equipment
      WHERE next_maintenance_date IS NOT NULL AND next_maintenance_date::date < CURRENT_DATE
    ),
    'overdue_by_category', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', cat, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT COALESCE(category,'unbekannt') cat, count(*) c FROM equipment
        WHERE next_maintenance_date IS NOT NULL AND next_maintenance_date::date < CURRENT_DATE
        GROUP BY 1
      ) z
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_market_live() TO authenticated;
