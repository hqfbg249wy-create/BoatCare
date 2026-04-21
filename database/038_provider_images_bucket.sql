-- ============================================================
-- Migration 038: Storage Bucket "provider-images" für Service-Provider Logos + Cover
-- ============================================================
-- Ersetzt die kaputten Google Places Photo URLs (Migration 037)
-- durch einen dauerhaften, eigenen Bildspeicher.
--
-- Ordnerstruktur im Bucket:
--   logos/{provider_id}.jpg    -> Logo (klein, quadratisch)
--   logos/{provider_id}.png
--   covers/{provider_id}.jpg   -> Cover/Header-Foto (16:9, ~1600x900)
--   gallery/{provider_id}/{n}.jpg  -> Optionale Galerie
--
-- Zugriffs-Regeln:
--   • SELECT   : öffentlich (Bucket ist public = true)
--   • INSERT   : authentifizierte Provider-Owner (owner_id = auth.uid())
--                ODER Admin-Rolle (role = 'service_role')
--   • UPDATE   : nur der eigene Provider-Owner
--   • DELETE   : nur der eigene Provider-Owner
--
-- Die Zuordnung Provider -> Owner läuft über service_providers.owner_id.
-- Falls dein Schema dafür noch keine Spalte hat, wird sie hier angelegt.
-- ============================================================

-- 1. owner_id-Spalte sicherstellen (für Provider-Portal)
ALTER TABLE public.service_providers
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_providers_owner_id
    ON public.service_providers(owner_id)
 WHERE owner_id IS NOT NULL;

-- 2. Bucket anlegen (öffentlich lesbar, 5 MB Limit, nur Bildtypen)
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

-- 3. Alte Policies aufräumen
DROP POLICY IF EXISTS "provider_images_select" ON storage.objects;
DROP POLICY IF EXISTS "provider_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "provider_images_update" ON storage.objects;
DROP POLICY IF EXISTS "provider_images_delete" ON storage.objects;

-- 4. Helper-Funktion: prüft, ob die aktuelle Auth-ID Owner des Providers im Pfad ist.
--    Pfad-Konvention: <folder>/<provider_uuid>[.ext|/...]
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
BEGIN
    -- split on '/' -> {folder, filename-or-subfolder, ...}
    parts := string_to_array(object_name, '/');
    IF array_length(parts, 1) < 2 THEN
        RETURN FALSE;
    END IF;

    -- Zweite Komponente ist entweder "<uuid>.<ext>" (logos/covers) oder "<uuid>" (gallery)
    BEGIN
        provider_uuid := split_part(parts[2], '.', 1)::uuid;
    EXCEPTION WHEN others THEN
        RETURN FALSE;
    END;

    RETURN EXISTS (
        SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_uuid
           AND sp.owner_id = auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_provider_owner_for_storage_path(TEXT) TO authenticated;

-- 5. Lesezugriff: jeder (inkl. anon) darf Bilder aus dem Bucket anzeigen
CREATE POLICY "provider_images_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'provider-images');

-- 6. Upload: Provider-Owner dürfen in ihren eigenen Ordner schreiben;
--    service_role darf alles (für Backfill-Skripte).
CREATE POLICY "provider_images_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'provider-images'
        AND (storage.foldername(name))[1] IN ('logos', 'covers', 'gallery')
        AND public.is_provider_owner_for_storage_path(name)
    );

-- 7. Update / Replace: nur eigener Provider
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

-- 8. Löschen: nur eigener Provider
CREATE POLICY "provider_images_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'provider-images'
        AND public.is_provider_owner_for_storage_path(name)
    );

-- 9. service_role bypass (service_role umgeht RLS per Definition, aber
--    für explizite Klarheit dokumentieren wir es hier):
COMMENT ON POLICY "provider_images_insert" ON storage.objects IS
    'Provider-Owner dürfen Bilder ihres eigenen Providers hochladen. service_role umgeht RLS für Backfill-Skripte.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 038 abgeschlossen';
    RAISE NOTICE '  • service_providers.owner_id angelegt (falls noch nicht vorhanden)';
    RAISE NOTICE '  • Storage Bucket provider-images (public, 5 MB, Bildtypen)';
    RAISE NOTICE '  • Policies: öffentliches Lesen, Owner-basierter Upload/Update/Delete';
    RAISE NOTICE '  • Pfadkonvention: logos/<uuid>.jpg | covers/<uuid>.jpg | gallery/<uuid>/<n>.jpg';
END $$;
