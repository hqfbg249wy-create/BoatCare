-- 142_ai_and_app_usage_analytics.sql
-- Admin-Marktanalyse: (1) KI-Nutzung nach Zweck/Quelle/Plattform aus dem
-- bestehenden Audit-Log ai_usage; (2) fortlaufende App-Nutzung (welcher
-- Bereich wie lange) via neuer Tabelle app_events.
-- Plattform wird in ai_usage.metadata->>'platform' getragen (ios|web|provider).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) KI-Nutzungs-Statistik (nur Admin/Readonly)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ai_usage_stats(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since timestamptz := now() - make_interval(days => greatest(1, p_days));
  result jsonb;
BEGIN
  IF NOT public.is_admin_or_readonly() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'days', p_days,
    'total', (SELECT count(*) FROM ai_usage WHERE created_at >= since),
    'users', (SELECT count(DISTINCT user_id) FROM ai_usage WHERE created_at >= since),
    'tokens', (SELECT COALESCE(sum(cost_tokens), 0) FROM ai_usage WHERE created_at >= since),
    'by_feature', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', feature, 'calls', c, 'users', u) ORDER BY c DESC)
      FROM (SELECT feature, count(*) c, count(DISTINCT user_id) u
            FROM ai_usage WHERE created_at >= since GROUP BY feature) f
    ), '[]'::jsonb),
    'by_source', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', source, 'calls', c) ORDER BY c DESC)
      FROM (SELECT source, count(*) c FROM ai_usage WHERE created_at >= since GROUP BY source) s
    ), '[]'::jsonb),
    'by_platform', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', plat, 'calls', c) ORDER BY c DESC)
      FROM (SELECT COALESCE(metadata->>'platform', 'unbekannt') plat, count(*) c
            FROM ai_usage WHERE created_at >= since GROUP BY 1) p
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'calls', c) ORDER BY d)
      FROM (SELECT to_char(created_at::date, 'YYYY-MM-DD') d, count(*) c
            FROM ai_usage WHERE created_at >= since GROUP BY 1) t
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ai_usage_stats(int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) App-Nutzungs-Events (welcher Bereich, wie lange)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'web', 'provider')),
  feature     text NOT NULL,          -- z.B. 'map', 'shop', 'inquiries', 'chat'
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_events_created ON public.app_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_feature ON public.app_events (feature, created_at DESC);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Jeder eingeloggte Nutzer darf seine eigenen Events schreiben.
DROP POLICY IF EXISTS app_events_insert_own ON public.app_events;
CREATE POLICY app_events_insert_own ON public.app_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Lesen nur ueber die Admin-RPC (SECURITY DEFINER). Kein SELECT-Policy noetig.

CREATE OR REPLACE FUNCTION public.admin_app_usage_stats(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since timestamptz := now() - make_interval(days => greatest(1, p_days));
  result jsonb;
BEGIN
  IF NOT public.is_admin_or_readonly() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'days', p_days,
    'sessions', (SELECT count(*) FROM app_events WHERE created_at >= since),
    'users', (SELECT count(DISTINCT user_id) FROM app_events WHERE created_at >= since),
    'total_minutes', (SELECT round(COALESCE(sum(duration_ms), 0) / 60000.0, 1) FROM app_events WHERE created_at >= since),
    'by_feature', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key', feature, 'minutes', round(mins, 1), 'visits', visits, 'users', users) ORDER BY mins DESC)
      FROM (SELECT feature, sum(duration_ms)/60000.0 mins, count(*) visits, count(DISTINCT user_id) users
            FROM app_events WHERE created_at >= since GROUP BY feature) f
    ), '[]'::jsonb),
    'by_platform', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', platform, 'minutes', round(mins, 1), 'visits', visits) ORDER BY mins DESC)
      FROM (SELECT platform, sum(duration_ms)/60000.0 mins, count(*) visits
            FROM app_events WHERE created_at >= since GROUP BY platform) p
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'minutes', round(mins, 1)) ORDER BY d)
      FROM (SELECT to_char(created_at::date, 'YYYY-MM-DD') d, sum(duration_ms)/60000.0 mins
            FROM app_events WHERE created_at >= since GROUP BY 1) t
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_app_usage_stats(int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) LIVE-Kennzahlen (immer aktuell, unabhaengig von Snapshots)
--    - Bootstyp NORMALISIERT (statt Freitext-Eingabe des Nutzers)
--    - Provider nach Land (live)
--    - Wartung ueberfaellig (live)
-- ─────────────────────────────────────────────────────────────────────────
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
