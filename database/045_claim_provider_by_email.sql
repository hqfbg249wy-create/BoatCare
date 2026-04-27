-- ============================================================
-- Migration 045: claim_provider_by_email RPC
-- ============================================================
-- Wenn ein Provider im Admin-Panel ohne user_id angelegt wird (handleAddProvider),
-- kann sich der Inhaber später per Sign-Up oder Magic-Link mit derselben
-- E-Mail registrieren. Diese RPC verknüpft den existierenden Provider-
-- Datensatz mit dem neuen Auth-User — ohne dass eine RLS-Policy das
-- direkt erlauben muss.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_provider_by_email()
RETURNS public.service_providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    uid   uuid := auth.uid();
    mail  text;
    row   public.service_providers;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    SELECT email INTO mail FROM auth.users WHERE id = uid;
    IF mail IS NULL OR mail = '' THEN
        RAISE EXCEPTION 'no email on auth user';
    END IF;

    -- Schon verknüpft? Zurückgeben.
    SELECT * INTO row FROM public.service_providers WHERE user_id = uid LIMIT 1;
    IF FOUND THEN
        RETURN row;
    END IF;

    -- Verwaister Provider mit passender E-Mail vorhanden? Verknüpfen.
    UPDATE public.service_providers
       SET user_id = uid,
           updated_at = now()
     WHERE LOWER(email) = LOWER(mail)
       AND user_id IS NULL
     RETURNING * INTO row;

    IF FOUND THEN
        RETURN row;
    END IF;

    -- Nichts gefunden → NULL-Row signalisiert "kein Profil"
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_provider_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_provider_by_email() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 045: claim_provider_by_email aktiv';
END $$;
