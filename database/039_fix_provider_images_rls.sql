-- ============================================================
-- Migration 039: Fix RLS für provider-images Bucket
-- ============================================================
-- Migration 038 hat die Storage-RLS gegen service_providers.owner_id
-- geprüft. Das Provider-Portal nutzt aber das bestehende Feld
-- service_providers.user_id, um den eingeloggten User einem Provider
-- zuzuordnen. Dadurch schlugen alle Uploads mit
-- "new row violates row-level security policy" fehl.
--
-- Diese Migration korrigiert die Helper-Funktion so, dass sowohl
-- user_id (Standardfall, vom Provider-Portal benutzt) als auch
-- owner_id (zukünftiger Standardname, falls jemand backfilled hat)
-- akzeptiert werden. service_role umgeht RLS weiterhin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_provider_owner_for_storage_path(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    parts TEXT[];
    provider_uuid UUID;
    uid UUID := auth.uid();
BEGIN
    IF uid IS NULL THEN
        RETURN FALSE;
    END IF;

    parts := string_to_array(object_name, '/');
    IF array_length(parts, 1) < 2 THEN
        RETURN FALSE;
    END IF;

    BEGIN
        provider_uuid := split_part(parts[2], '.', 1)::uuid;
    EXCEPTION WHEN others THEN
        RETURN FALSE;
    END;

    RETURN EXISTS (
        SELECT 1
          FROM public.service_providers sp
         WHERE sp.id = provider_uuid
           AND (
                sp.user_id  = uid
             OR sp.owner_id = uid
           )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_provider_owner_for_storage_path(TEXT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 039: provider-images RLS akzeptiert jetzt user_id ODER owner_id';
END $$;
