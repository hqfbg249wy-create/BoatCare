-- 169_api_rate_limit.sql
-- Generischer, atomarer Fixed-Window-Rate-Limiter fuer oeffentliche Edge-APIs
-- (products-api ohne JWT-Gateway). Schuetzt vor Ueberlast/Missbrauch und liefert
-- ein sauberes 429, ohne DB/Budget zu gefaehrden.

CREATE TABLE IF NOT EXISTS public.api_rate_limit (
  bucket     text PRIMARY KEY,
  count      integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limit_expires ON public.api_rate_limit (expires_at);

-- Zaehlt einen Treffer im aktuellen Zeitfenster atomar hoch. Liefert true,
-- solange <= p_max, sonst false (Limit erreicht). p_key = z. B.
-- 'products-api:write:<providerId>'. Fenster ueber p_window_seconds.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(
  p_key text, p_max integer, p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket text := p_key || ':' || floor(extract(epoch FROM now()) / greatest(p_window_seconds,1))::bigint;
  v_count  integer;
BEGIN
  INSERT INTO public.api_rate_limit (bucket, count, expires_at)
    VALUES (v_bucket, 1, now() + make_interval(secs => greatest(p_window_seconds,1) * 2))
  ON CONFLICT (bucket) DO UPDATE
    SET count = public.api_rate_limit.count + 1
  RETURNING count INTO v_count;

  -- Gelegentliches Aufraeumen abgelaufener Buckets (billig, selten).
  IF random() < 0.01 THEN
    DELETE FROM public.api_rate_limit WHERE expires_at < now();
  END IF;

  RETURN v_count <= p_max;
END $$;

GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) TO anon, authenticated, service_role;
