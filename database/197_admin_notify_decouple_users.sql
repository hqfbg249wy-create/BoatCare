-- =====================================================================
-- 197_admin_notify_decouple_users — „Neuer Nutzer"-Push nur noch für
-- EINFACHE NUTZER / EIGNER (profiles.role = 'user'), nicht mehr für Provider
-- oder Admins.
--
-- Hintergrund: Provider-Profile werden bereits beim Anlegen mit role='provider'
-- erstellt (Migration 110 ensure_provider_profile / Signup-Trigger 108), Admins
-- mit 'admin'/'admin_readonly'. Dadurch lassen sich die Ereignisse sauber über
-- die Rolle trennen: „neuer Anbieter" läuft über den service_providers-Trigger,
-- „neuer Nutzer" nur noch über echte Eigner-Konten.
--
-- Nur die Triggerfunktion wird ersetzt; der Trigger selbst bleibt (Migration 196).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_admins_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    -- Nur echte Eigner/einfache Nutzer. Provider ('provider') und Admins
    -- ('admin'/'admin_readonly') sind ausgenommen (Provider => eigenes Ereignis).
    IF COALESCE(NEW.role, 'user') <> 'user' THEN
        RETURN NEW;
    END IF;
    PERFORM public.call_notify_admins(jsonb_build_object('event', 'new_user', 'user_id', NEW.id));
    RETURN NEW;
END $$;

DO $$ BEGIN
    RAISE NOTICE '✅ Migration 197: „Neuer Nutzer"-Push nur noch für role=user (Eigner). Provider/Admin ausgenommen.';
END $$;
