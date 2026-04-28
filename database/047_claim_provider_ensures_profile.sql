-- ============================================================
-- Migration 047: claim_provider_by_email + Profile-Backfill absichern
-- ============================================================
-- service_providers.user_id hat eine FK auf profiles.id. Bei alten Auth-
-- Usern (vor Migration 041) existiert die profiles-Zeile teilweise nicht
-- → die UPDATE in claim_provider_by_email scheitert mit FK-Violation.
--
-- Wir holen das hier nach und legen die Funktion so um, dass sie die
-- profiles-Zeile zur Not selbst anlegt, bevor sie verknüpft.
-- ============================================================

-- 1) Backfill: für alle Auth-User ohne profiles-Zeile eine anlegen
INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       'user',
       now(),
       now()
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2) RPC: legt profiles automatisch an, falls noch nicht da
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

    -- Sicherstellen, dass eine profiles-Zeile existiert (FK-Voraussetzung)
    INSERT INTO public.profiles (id, email, role, created_at, updated_at)
    VALUES (uid, mail, 'user', now(), now())
    ON CONFLICT (id) DO NOTHING;

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

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_provider_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_provider_by_email() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 047: profiles-Backfill + claim_provider_by_email gehärtet';
END $$;
