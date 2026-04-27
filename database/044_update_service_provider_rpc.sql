-- ============================================================
-- Migration 044: update_service_provider RPC auf aktuelles Schema
-- ============================================================
-- Die alte Version aus database/create-update-function.sql benutzt noch
-- die Spalte `address` (gibt es nicht mehr) und kennt weder `category2`
-- noch `category3`. Das Admin-Web ruft die Funktion mit den neuen Feldern
-- auf → der Aufruf scheitert immer und der "Schema-Cache"-Fallback meldet
-- irreführend, dass Stadt/Land nicht gespeichert werden konnten.
--
-- Lösung: Funktion mit korrekter Signatur neu anlegen. Direktes UPDATE
-- aus dem Admin-Web funktioniert ebenfalls (siehe app.js); diese RPC
-- bleibt für Server-zu-Server-Aufrufe und Backwards-Compat erhalten.
-- ============================================================

-- Alte Version explizit droppen (Signatur hat sich geändert)
DROP FUNCTION IF EXISTS public.update_service_provider(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT[], TEXT[]
);

CREATE OR REPLACE FUNCTION public.update_service_provider(
    provider_id          UUID,
    provider_name        TEXT,
    provider_category    TEXT,
    provider_category2   TEXT             DEFAULT NULL,
    provider_category3   TEXT             DEFAULT NULL,
    provider_description TEXT             DEFAULT NULL,
    provider_street      TEXT             DEFAULT NULL,
    provider_postal_code TEXT             DEFAULT NULL,
    provider_city        TEXT             DEFAULT NULL,
    provider_country     TEXT             DEFAULT NULL,
    provider_latitude    DOUBLE PRECISION DEFAULT NULL,
    provider_longitude   DOUBLE PRECISION DEFAULT NULL,
    provider_phone       TEXT             DEFAULT NULL,
    provider_email       TEXT             DEFAULT NULL,
    provider_website     TEXT             DEFAULT NULL,
    provider_services    TEXT[]           DEFAULT NULL,
    provider_brands      TEXT[]           DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Nur Admins dürfen fremde Provider editieren
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND role IN ('admin', 'admin_readonly')
    ) THEN
        RAISE EXCEPTION 'forbidden: admin only';
    END IF;

    UPDATE public.service_providers
       SET name        = provider_name,
           category    = provider_category,
           category2   = provider_category2,
           category3   = provider_category3,
           description = provider_description,
           street      = provider_street,
           postal_code = provider_postal_code,
           city        = provider_city,
           country     = provider_country,
           latitude    = provider_latitude,
           longitude   = provider_longitude,
           phone       = provider_phone,
           email       = provider_email,
           website     = provider_website,
           services    = provider_services,
           brands      = provider_brands,
           updated_at  = NOW()
     WHERE id = provider_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_service_provider(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT[], TEXT[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_service_provider(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT[], TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 044: update_service_provider mit aktuellem Schema neu angelegt';
END $$;
