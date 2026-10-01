-- 175_announcement_i18n.sql
-- Mehrsprachige Ankuendigungen + Geraete-/Abo-Sprache fuer lokalisierte Pushes.
--   • announcements.translations: { "de": {"title","body"}, "en": {...}, ... }
--   • device_tokens.locale / web_push_subscriptions.locale: Sprache je Geraet
--     -> Push wird in der jeweiligen Sprache zugestellt.

BEGIN;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS translations jsonb;

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS locale text;

ALTER TABLE public.web_push_subscriptions
  ADD COLUMN IF NOT EXISTS locale text;

-- ── list_my_announcements: translations mitliefern (Client waehlt Sprache) ──
DROP FUNCTION IF EXISTS public.list_my_announcements();
CREATE OR REPLACE FUNCTION public.list_my_announcements()
RETURNS TABLE(
  id uuid, title text, body text, accent text, category text,
  action_url text, translations jsonb, created_at timestamptz,
  read_at timestamptz, dismissed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.body, a.accent, a.category, a.action_url, a.translations,
         a.created_at, r.read_at, r.dismissed_at
    FROM public.announcements a
    LEFT JOIN public.announcement_reads r
      ON r.announcement_id = a.id AND r.user_id = auth.uid()
   WHERE public.user_matches_audience(auth.uid(), a.audience)
   ORDER BY a.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_my_announcements() TO authenticated;

-- ── register_device_token: Locale mitspeichern (neue 4-arg-Ueberladung) ──
CREATE OR REPLACE FUNCTION register_device_token(
  p_token       TEXT,
  p_platform    TEXT DEFAULT 'ios',
  p_environment TEXT DEFAULT 'production',
  p_locale      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN RAISE EXCEPTION 'token required'; END IF;

  INSERT INTO device_tokens (token, user_id, platform, environment, locale, updated_at)
  VALUES (p_token, auth.uid(),
          COALESCE(p_platform, 'ios'),
          COALESCE(p_environment, 'production'),
          p_locale, NOW())
  ON CONFLICT (token) DO UPDATE
    SET user_id     = EXCLUDED.user_id,
        platform    = EXCLUDED.platform,
        environment = EXCLUDED.environment,
        locale      = COALESCE(EXCLUDED.locale, device_tokens.locale),
        updated_at  = NOW();
END $$;
GRANT EXECUTE ON FUNCTION register_device_token(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── register_web_push: Locale mitspeichern ──
DROP FUNCTION IF EXISTS public.register_web_push(text, text, text);
CREATE OR REPLACE FUNCTION public.register_web_push(
  p_endpoint text, p_p256dh text, p_auth text, p_locale text DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.web_push_subscriptions(endpoint, user_id, p256dh, auth, locale, updated_at)
  VALUES (p_endpoint, auth.uid(), p_p256dh, p_auth, p_locale, now())
  ON CONFLICT (endpoint)
  DO UPDATE SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                locale = COALESCE(EXCLUDED.locale, public.web_push_subscriptions.locale),
                updated_at = now();
$$;
GRANT EXECUTE ON FUNCTION public.register_web_push(text, text, text, text) TO authenticated;

COMMIT;
