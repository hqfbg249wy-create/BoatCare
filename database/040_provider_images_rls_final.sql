-- ============================================================
-- Migration 040: provider-images Bucket + RLS — finale Fassung
-- ============================================================
-- Ersetzt die defekten Versuche aus 038/039. Arbeitet ausschließlich
-- mit der bereits vorhandenen Spalte service_providers.user_id.
-- Idempotent: kann beliebig oft ausgeführt werden.
-- ============================================================

-- 1. Bucket sicherstellen
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'provider-images',
    'provider-images',
    true,
    5 * 1024 * 1024,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Alte Policies weg
DROP POLICY IF EXISTS "provider_images_select" ON storage.objects;
DROP POLICY IF EXISTS "provider_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "provider_images_update" ON storage.objects;
DROP POLICY IF EXISTS "provider_images_delete" ON storage.objects;

-- 3. Helper-Funktion — prüft nur gegen die bestehende user_id-Spalte
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
    IF uid IS NULL THEN RETURN FALSE; END IF;
    parts := string_to_array(object_name, '/');
    IF array_length(parts, 1) < 2 THEN RETURN FALSE; END IF;
    BEGIN
        provider_uuid := split_part(parts[2], '.', 1)::uuid;
    EXCEPTION WHEN others THEN RETURN FALSE;
    END;
    RETURN EXISTS (
        SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_uuid
           AND sp.user_id = uid
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_provider_owner_for_storage_path(TEXT) TO authenticated;

-- 4. Policies neu anlegen
CREATE POLICY "provider_images_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'provider-images');

CREATE POLICY "provider_images_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'provider-images'
        AND (storage.foldername(name))[1] IN ('logos', 'covers', 'gallery')
        AND public.is_provider_owner_for_storage_path(name)
    );

CREATE POLICY "provider_images_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'provider-images'
        AND public.is_provider_owner_for_storage_path(name)
    )
    WITH CHECK (
        bucket_id = 'provider-images'
        AND public.is_provider_owner_for_storage_path(name)
    );

CREATE POLICY "provider_images_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'provider-images'
        AND public.is_provider_owner_for_storage_path(name)
    );

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 040 abgeschlossen — provider-images Upload sollte jetzt funktionieren';
END $$;
