-- 151_platform_events.sql
-- Zustell-/Ereignis-Log der Plattform: was hat Skipily ausgeloest (E-Mail via
-- Resend, Push, In-App) und wie ist der Status. Sichtbar im Admin-Panel.
-- Geschrieben wird ausschliesslich serverseitig (Edge Functions mit Service-
-- Role, umgeht RLS). Gelesen wird nur ueber die Admin-RPC unten.

CREATE TABLE IF NOT EXISTS public.platform_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Fachliches Ereignis, z. B. inquiry_sent, offer_sent, new_message,
  -- new_order, order_shipped, provider_welcome, member_invite,
  -- maintenance_reminder, subscription_active
  event_type          text NOT NULL,
  channel             text NOT NULL DEFAULT 'email',   -- email | push | inapp
  -- triggered | queued | sent | delivered | opened | bounced | complained
  -- | failed | skipped
  status              text NOT NULL DEFAULT 'triggered',
  provider_id         uuid,
  user_id             uuid,
  inquiry_id          uuid,
  order_id            uuid,
  recipient           text,          -- E-Mail-Adresse bzw. Push-Ziel
  subject             text,
  provider_message_id text,          -- Resend-Message-ID (email) / Push-ID
  error               text,          -- Fehlermeldung bei status = failed
  meta                jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_platform_events_created   ON public.platform_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_msgid     ON public.platform_events (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_type      ON public.platform_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_status    ON public.platform_events (status);
CREATE INDEX IF NOT EXISTS idx_platform_events_provider  ON public.platform_events (provider_id, created_at DESC);

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
-- Keine Policy fuer anon/authenticated: Lesen nur ueber die Admin-RPC,
-- Schreiben nur mit Service-Role (umgeht RLS).
REVOKE ALL ON public.platform_events FROM anon, authenticated;

-- Admin-Lesefunktion mit Filtern. Nur Admin/Read-Only-Admin.
CREATE OR REPLACE FUNCTION public.admin_platform_events(
  p_limit      integer DEFAULT 200,
  p_status     text    DEFAULT NULL,
  p_channel    text    DEFAULT NULL,
  p_event_type text    DEFAULT NULL,
  p_search     text    DEFAULT NULL
)
RETURNS SETOF public.platform_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_or_readonly() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT *
    FROM public.platform_events e
    WHERE (p_status     IS NULL OR e.status     = p_status)
      AND (p_channel    IS NULL OR e.channel    = p_channel)
      AND (p_event_type IS NULL OR e.event_type = p_event_type)
      AND (
        p_search IS NULL OR p_search = ''
        OR e.recipient ILIKE '%' || p_search || '%'
        OR e.subject   ILIKE '%' || p_search || '%'
        OR e.provider_message_id ILIKE '%' || p_search || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 1000));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_platform_events(integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_events(integer, text, text, text, text) TO authenticated;

-- Kompakte Kennzahlen fuer die Kopfzeile (letzte 7 Tage) — ebenfalls Admin-only.
CREATE OR REPLACE FUNCTION public.admin_platform_events_summary()
RETURNS TABLE (status text, channel text, n bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_or_readonly() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT e.status, e.channel, COUNT(*)::bigint
    FROM public.platform_events e
    WHERE e.created_at > now() - interval '7 days'
    GROUP BY e.status, e.channel;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_platform_events_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_events_summary() TO authenticated;
