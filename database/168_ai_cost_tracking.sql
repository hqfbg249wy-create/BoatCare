-- 168_ai_cost_tracking.sql
-- KI-Kosten je Nutzer + gesamt fuer die Admin-Seite (taeglich/monatlich/
-- jaehrlich). Jeder KI-Call speichert jetzt Input-/Output-Token, Modell und die
-- daraus berechneten Kosten (cost_usd, in der Function berechnet). Auswertung
-- ueber admin_ai_costs (Zeitraum) + admin_ai_cost_totals (Tag/Monat/Jahr).

-- ── Spalten fuer Kostentransparenz ──
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS input_tokens  integer;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS model         text;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS cost_usd      numeric(12,6) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage (created_at);

-- ── increment_ai_usage um Kosten/Token/Modell erweitern ──
-- Alte 6-Parameter-Signatur droppen und durch eine 10-Parameter-Variante
-- ersetzen (neue Felder mit Defaults -> bestehende Aufrufer bleiben
-- kompatibel). Rumpf 1:1 aus Migration 061 uebernommen (current_year_month()
-- + Partial-Index-ON-CONFLICT), nur INSERT um die Kostenspalten ergaenzt.
DROP FUNCTION IF EXISTS public.increment_ai_usage(uuid, uuid, text, text, int, jsonb);

CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id      uuid,
  p_provider_id  uuid  DEFAULT NULL,
  p_feature      text  DEFAULT NULL,
  p_source       text  DEFAULT NULL,
  p_cost_tokens  int   DEFAULT 0,
  p_metadata     jsonb DEFAULT NULL,
  p_input_tokens  int  DEFAULT NULL,
  p_output_tokens int  DEFAULT NULL,
  p_model         text DEFAULT NULL,
  p_cost_usd      numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ym TEXT := current_year_month();
BEGIN
  INSERT INTO public.ai_usage
    (user_id, feature, source, provider_id, cost_tokens, metadata,
     input_tokens, output_tokens, model, cost_usd)
  VALUES
    (p_user_id, p_feature, p_source, p_provider_id, p_cost_tokens, p_metadata,
     p_input_tokens, p_output_tokens, p_model, coalesce(p_cost_usd, 0));

  IF p_source = 'provider_quota' AND p_provider_id IS NOT NULL THEN
    INSERT INTO public.ai_monthly_usage (provider_id, year_month, call_count, last_call_at)
    VALUES (p_provider_id, ym, 1, NOW())
    ON CONFLICT (provider_id, year_month) WHERE user_id IS NULL
    DO UPDATE SET call_count = ai_monthly_usage.call_count + 1, last_call_at = NOW();
  ELSE
    INSERT INTO public.ai_monthly_usage (user_id, year_month, call_count, last_call_at)
    VALUES (p_user_id, ym, 1, NOW())
    ON CONFLICT (user_id, year_month) WHERE provider_id IS NULL
    DO UPDATE SET call_count = ai_monthly_usage.call_count + 1, last_call_at = NOW();
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, uuid, text, text, int, jsonb, int, int, text, numeric)
  TO authenticated, service_role;

-- ── Admin-Guard ──
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- ── Kosten je Nutzer in einem Zeitraum (+ E-Mail/Name aus profiles) ──
CREATE OR REPLACE FUNCTION public.admin_ai_costs(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(
  user_id uuid, email text, full_name text,
  calls bigint, input_tokens bigint, output_tokens bigint, cost_usd numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY
    SELECT u.user_id,
           pr.email,
           pr.full_name,
           count(*)::bigint,
           coalesce(sum(u.input_tokens),0)::bigint,
           coalesce(sum(u.output_tokens),0)::bigint,
           round(coalesce(sum(u.cost_usd),0), 4)
    FROM public.ai_usage u
    LEFT JOIN public.profiles pr ON pr.id = u.user_id
    WHERE u.created_at >= p_from AND u.created_at < p_to
    GROUP BY u.user_id, pr.email, pr.full_name
    ORDER BY coalesce(sum(u.cost_usd),0) DESC;
END $$;

-- ── Gesamtsummen fuer Tag/Monat/Jahr (ein Aufruf) ──
CREATE OR REPLACE FUNCTION public.admin_ai_cost_totals()
RETURNS TABLE(period text, calls bigint, cost_usd numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY
    SELECT 'today'::text, count(*)::bigint, round(coalesce(sum(cost_usd),0),4)
      FROM public.ai_usage WHERE created_at >= date_trunc('day', now())
    UNION ALL
    SELECT 'month', count(*)::bigint, round(coalesce(sum(cost_usd),0),4)
      FROM public.ai_usage WHERE created_at >= date_trunc('month', now())
    UNION ALL
    SELECT 'year', count(*)::bigint, round(coalesce(sum(cost_usd),0),4)
      FROM public.ai_usage WHERE created_at >= date_trunc('year', now());
END $$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_costs(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_cost_totals() TO authenticated;
