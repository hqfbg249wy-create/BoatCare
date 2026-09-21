-- 144_admin_user_behavior_stats.sql
-- Dashboard-Nutzerverhalten: KI-Nutzung, genutzte Bereiche, Abo-Funnel
-- (warum noch kein Abo) + Basis fuer Handlungsempfehlungen.

CREATE OR REPLACE FUNCTION public.admin_user_behavior_stats(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since timestamptz := now() - make_interval(days => greatest(1, p_days));
  free_limit int := 10; -- Free-Tier lifetime (siehe aiQuota)
  result jsonb;
BEGIN
  IF NOT public.is_admin_or_readonly() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'days', p_days,
    'total_users', (SELECT count(*) FROM profiles),
    'active_subscribers', (SELECT count(*) FROM user_subscriptions WHERE status = 'active'),
    'users_with_ai', (SELECT count(DISTINCT user_id) FROM ai_usage WHERE user_id IS NOT NULL),
    'free_exhausted', (
      SELECT count(*) FROM (
        SELECT user_id FROM ai_usage
        WHERE user_id IS NOT NULL AND feature IN ('chat','photo_analysis','suggest_equipment')
        GROUP BY user_id HAVING count(*) >= free_limit
      ) t
    ),
    -- Free aufgebraucht UND (noch) kein aktives Abo = Haupt-Conversion-Zielgruppe
    'free_exhausted_no_sub', (
      SELECT count(*) FROM (
        SELECT user_id FROM ai_usage
        WHERE user_id IS NOT NULL AND feature IN ('chat','photo_analysis','suggest_equipment')
        GROUP BY user_id HAVING count(*) >= free_limit
      ) t
      WHERE user_id NOT IN (SELECT user_id FROM user_subscriptions WHERE status = 'active')
    ),
    'ai_by_feature', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', feature, 'calls', c) ORDER BY c DESC)
      FROM (SELECT feature, count(*) c FROM ai_usage WHERE created_at >= since GROUP BY feature) f
    ), '[]'::jsonb),
    'app_by_feature', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', feature, 'minutes', round(mins,1), 'visits', visits) ORDER BY mins DESC)
      FROM (SELECT feature, sum(duration_ms)/60000.0 mins, count(*) visits
            FROM app_events WHERE created_at >= since GROUP BY feature) a
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_behavior_stats(int) TO authenticated;
