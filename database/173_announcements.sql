-- 173_announcements.sql
-- Plattform-Ankuendigungen (Broadcast-Push vom Admin an die Nutzer):
--   • Updates, neue Provider/Haendler etc.
--   • Zustellung: APNs (iOS) + Web Push; zusaetzlich In-App-Banner und ein
--     farbig gekennzeichneter Eintrag unter Nachrichten/Kontakte.
--   • Zielgruppe je Versand: alle / nur Eigner / nur Provider.
--   • Lese-/Ausblend-Status je Nutzer in announcement_reads.

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  -- Farbkennzeichnung zur Unterscheidung von Provider-Nachrichten.
  accent      text NOT NULL DEFAULT 'blue',
  category    text,                       -- optional: 'update' | 'new_provider' | 'general'
  audience    text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','owners','providers')),
  action_url  text,                       -- optionaler Link fuer "mehr Informationen"
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON public.announcements (created_at DESC);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  PRIMARY KEY (announcement_id, user_id)
);

-- Web-Push-Abos (Browser / PWA). Pro Endpoint genau ein Nutzer.
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  endpoint   text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_push_user_idx ON public.web_push_subscriptions (user_id);

ALTER TABLE public.announcements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_subscriptions  ENABLE ROW LEVEL SECURITY;

-- Lesen/Schreiben der EIGENEN Lese-Status.
DROP POLICY IF EXISTS announcement_reads_own ON public.announcement_reads;
CREATE POLICY announcement_reads_own ON public.announcement_reads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Web-Push-Abos: nur eigene lesen/loeschen (Schreiben via RPC).
DROP POLICY IF EXISTS web_push_select_own ON public.web_push_subscriptions;
CREATE POLICY web_push_select_own ON public.web_push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS web_push_delete_own ON public.web_push_subscriptions;
CREATE POLICY web_push_delete_own ON public.web_push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- announcements selbst: KEIN direktes Client-SELECT (Zielgruppenfilter laeuft
-- ueber list_my_announcements). Admin schreibt via Edge Function (service_role).

-- ── Zielgruppen-Logik (eine Quelle fuer Liste + Empfaengeraufloesung) ──
CREATE OR REPLACE FUNCTION public.is_provider_user(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.user_id = p_uid)
      OR EXISTS (SELECT 1 FROM public.provider_members pm WHERE pm.user_id = p_uid);
$$;

CREATE OR REPLACE FUNCTION public.user_matches_audience(p_uid uuid, p_audience text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_audience
    WHEN 'all'       THEN true
    WHEN 'providers' THEN public.is_provider_user(p_uid)
    WHEN 'owners'    THEN NOT public.is_provider_user(p_uid)
    ELSE false END;
$$;

-- ── Fuer den aktuellen Nutzer sichtbare Ankuendigungen inkl. Lese-Status ──
CREATE OR REPLACE FUNCTION public.list_my_announcements()
RETURNS TABLE(
  id uuid, title text, body text, accent text, category text,
  action_url text, created_at timestamptz, read_at timestamptz, dismissed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.body, a.accent, a.category, a.action_url, a.created_at,
         r.read_at, r.dismissed_at
    FROM public.announcements a
    LEFT JOIN public.announcement_reads r
      ON r.announcement_id = a.id AND r.user_id = auth.uid()
   WHERE public.user_matches_audience(auth.uid(), a.audience)
   ORDER BY a.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.mark_announcement_read(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.announcement_reads(announcement_id, user_id, read_at)
  VALUES (p_id, auth.uid(), now())
  ON CONFLICT (announcement_id, user_id)
  DO UPDATE SET read_at = COALESCE(public.announcement_reads.read_at, now());
$$;

CREATE OR REPLACE FUNCTION public.dismiss_announcement(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.announcement_reads(announcement_id, user_id, read_at, dismissed_at)
  VALUES (p_id, auth.uid(), now(), now())
  ON CONFLICT (announcement_id, user_id)
  DO UPDATE SET dismissed_at = now(),
                read_at = COALESCE(public.announcement_reads.read_at, now());
$$;

-- ── Empfaenger-IDs einer Zielgruppe (nur service_role / Edge Function) ──
CREATE OR REPLACE FUNCTION public.announcement_recipient_ids(p_audience text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id FROM auth.users u
   WHERE public.user_matches_audience(u.id, p_audience);
$$;

-- ── Web-Push-Abo registrieren/entfernen (aktueller Nutzer) ──
CREATE OR REPLACE FUNCTION public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.web_push_subscriptions(endpoint, user_id, p256dh, auth, updated_at)
  VALUES (p_endpoint, auth.uid(), p_p256dh, p_auth, now())
  ON CONFLICT (endpoint)
  DO UPDATE SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth, updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.unregister_web_push(p_endpoint text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.web_push_subscriptions
   WHERE endpoint = p_endpoint AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.announcement_recipient_ids(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.announcement_recipient_ids(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.list_my_announcements()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_announcement_read(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_announcement(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_web_push(text,text,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_web_push(text)          TO authenticated;

COMMIT;
