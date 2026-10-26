-- =====================================================================
-- 196_admin_push_notifications — Admin-Push bei moderationspflichtigen News,
-- neuen Providern und neuen Nutzern. Selektiv je Admin an-/abschaltbar.
--
-- Bestandteile:
--   1) admin_notification_prefs: je Admin drei Schalter (news_review,
--      new_provider, new_user). Default an. Admin verwaltet nur die eigene Zeile.
--   2) RPCs get_/set_admin_notification_prefs (mit Default-Fallback).
--   3) Trigger für NEUE NUTZER (profiles INSERT) und NEUE PROVIDER
--      (service_providers: user_id null -> gesetzt = Registrierung/Claim), die
--      per pg_net die Edge Function notify-admins aufrufen (Shared-Secret-Muster
--      wie Migration 135). News-Moderation wird in der Function create-news-post
--      selbst gemeldet (dort ist der Status bekannt).
--
-- SETUP (einmalig, sonst werden Pushes still übersprungen):
--   1) Vault-Secret: select vault.create_secret('<GEHEIM>', 'admin_notify_secret');
--   2) Edge-Env: ADMIN_NOTIFY_SECRET = <derselbe Wert> (für notify-admins
--      UND create-news-post / update-news-post).
--   3) notify-admins deployen: supabase functions deploy notify-admins --no-verify-jwt
--   VAPID-Keys sind aus den Ankündigungen bereits gesetzt.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 1) Einstellungen je Admin ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_notification_prefs (
    admin_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    news_review  BOOLEAN NOT NULL DEFAULT true,
    new_provider BOOLEAN NOT NULL DEFAULT true,
    new_user     BOOLEAN NOT NULL DEFAULT true,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

-- Nur Admins, nur die eigene Zeile.
DROP POLICY IF EXISTS admin_notif_prefs_select ON public.admin_notification_prefs;
CREATE POLICY admin_notif_prefs_select ON public.admin_notification_prefs
    FOR SELECT TO authenticated
    USING (admin_id = auth.uid()
           AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS admin_notif_prefs_write ON public.admin_notification_prefs;
CREATE POLICY admin_notif_prefs_write ON public.admin_notification_prefs
    FOR ALL TO authenticated
    USING (admin_id = auth.uid()
           AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
    WITH CHECK (admin_id = auth.uid()
           AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Eigene Einstellungen lesen (mit Default an, falls noch keine Zeile).
CREATE OR REPLACE FUNCTION public.get_admin_notification_prefs()
RETURNS TABLE(news_review BOOLEAN, new_provider BOOLEAN, new_user BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        COALESCE(p.news_review,  true),
        COALESCE(p.new_provider, true),
        COALESCE(p.new_user,     true)
    FROM (SELECT 1) one
    LEFT JOIN public.admin_notification_prefs p ON p.admin_id = auth.uid()
    WHERE EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin');
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_notification_prefs() TO authenticated;

-- Eigene Einstellungen setzen (Upsert; nur Admins).
CREATE OR REPLACE FUNCTION public.set_admin_notification_prefs(
    p_news_review BOOLEAN, p_new_provider BOOLEAN, p_new_user BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'not an admin';
    END IF;
    INSERT INTO public.admin_notification_prefs(admin_id, news_review, new_provider, new_user, updated_at)
    VALUES (auth.uid(), p_news_review, p_new_provider, p_new_user, now())
    ON CONFLICT (admin_id) DO UPDATE
        SET news_review = EXCLUDED.news_review,
            new_provider = EXCLUDED.new_provider,
            new_user = EXCLUDED.new_user,
            updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.set_admin_notification_prefs(BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ── 2) Gemeinsamer pg_net-Aufruf an notify-admins ────────────────────
CREATE OR REPLACE FUNCTION public.call_notify_admins(p_body JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    fn_url   TEXT := 'https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/notify-admins';
    anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';
    secret   TEXT;
BEGIN
    SELECT decrypted_secret INTO secret
      FROM vault.decrypted_secrets WHERE name = 'admin_notify_secret' LIMIT 1;
    IF secret IS NULL OR secret = '' THEN
        RAISE WARNING 'notify-admins: Vault-Secret "admin_notify_secret" fehlt — übersprungen';
        RETURN;
    END IF;
    PERFORM net.http_post(
        url     := fn_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || anon_key,
            'x-internal-secret', secret),
        body    := p_body
    );
END $$;

-- ── 3a) Neue Nutzer (profiles INSERT) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_admins_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    IF NEW.role = 'admin' THEN RETURN NEW; END IF;  -- keine Selbst-Meldung
    PERFORM public.call_notify_admins(jsonb_build_object('event', 'new_user', 'user_id', NEW.id));
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_user ON public.profiles;
CREATE TRIGGER trg_notify_admins_new_user
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_user();

-- ── 3b) Neue Provider (service_providers: user_id null -> gesetzt) ────
CREATE OR REPLACE FUNCTION public.notify_admins_new_provider()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.user_id IS NOT NULL THEN
            PERFORM public.call_notify_admins(jsonb_build_object('event', 'new_provider', 'provider_id', NEW.id));
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.user_id IS NOT NULL AND (OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
            PERFORM public.call_notify_admins(jsonb_build_object('event', 'new_provider', 'provider_id', NEW.id));
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_provider ON public.service_providers;
CREATE TRIGGER trg_notify_admins_new_provider
    AFTER INSERT OR UPDATE OF user_id ON public.service_providers
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_provider();

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 196: Admin-Push-Einstellungen + Trigger aktiv. Setup: Vault-Secret admin_notify_secret + Edge-Env ADMIN_NOTIFY_SECRET + notify-admins deployen (--no-verify-jwt).';
END $$;
