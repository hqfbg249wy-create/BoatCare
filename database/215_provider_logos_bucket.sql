-- ============================================================
-- Migration 215: Storage-Bucket "provider-logos" fuer den Admin-Logo-Upload
-- ============================================================
-- Admin-Web ("Provider hinzufuegen") laedt das Firmenlogo nach
-- provider-logos/<timestamp>_<rand>.<ext>. Fuer diesen Bucket gab es
-- keine INSERT-Policy -> "new row violates row-level security policy".
--   SELECT : oeffentlich (Logos werden in App/Web angezeigt)
--   INSERT/UPDATE/DELETE : nur Admins (public.is_admin())
-- Idempotent: kann gefahrlos mehrfach ausgefuehrt werden.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('provider-logos', 'provider-logos', true, 5 * 1024 * 1024,
        ARRAY['image/jpeg','image/png','image/webp','image/svg+xml','image/gif','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "provider_logos_select" ON storage.objects;
DROP POLICY IF EXISTS "provider_logos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "provider_logos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "provider_logos_admin_delete" ON storage.objects;

CREATE POLICY "provider_logos_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'provider-logos');

CREATE POLICY "provider_logos_admin_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'provider-logos' AND public.is_admin());

-- upsert: true im Admin-Web braucht zusaetzlich UPDATE.
CREATE POLICY "provider_logos_admin_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'provider-logos' AND public.is_admin())
    WITH CHECK (bucket_id = 'provider-logos' AND public.is_admin());

CREATE POLICY "provider_logos_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'provider-logos' AND public.is_admin());
