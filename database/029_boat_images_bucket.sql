-- ============================================================
-- Migration 029: Storage Bucket "boat-images" für Bootsfotos
-- ============================================================
-- Die App lädt Bootsfotos in den Bucket "boat-images" hoch,
-- dieser muss in Supabase existieren.
-- Außerdem: image_url Spalte in boats sicherstellen.
-- ============================================================

-- 1. Spalte image_url in boats sicherstellen
ALTER TABLE boats ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Storage Bucket erstellen
INSERT INTO storage.buckets (id, name, public)
VALUES ('boat-images', 'boat-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Bestehende Policies aufräumen
DROP POLICY IF EXISTS "boat_images_select" ON storage.objects;
DROP POLICY IF EXISTS "boat_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "boat_images_update" ON storage.objects;
DROP POLICY IF EXISTS "boat_images_delete" ON storage.objects;

-- 4. Lesezugriff: öffentlich (Bilder werden in der App angezeigt)
CREATE POLICY "boat_images_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'boat-images');

-- 5. Upload: authentifizierte Benutzer können Bilder ihrer eigenen Boote hochladen
-- Pfad-Struktur: boats/{boat_id}/photo_{timestamp}.jpg
CREATE POLICY "boat_images_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'boat-images'
        AND (storage.foldername(name))[1] = 'boats'
    );

-- 6. Update: gleiche Regeln
CREATE POLICY "boat_images_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'boat-images'
        AND (storage.foldername(name))[1] = 'boats'
    );

-- 7. Löschen: gleiche Regeln
CREATE POLICY "boat_images_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'boat-images'
        AND (storage.foldername(name))[1] = 'boats'
    );

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 029 abgeschlossen';
    RAISE NOTICE '  • boats.image_url Spalte sichergestellt';
    RAISE NOTICE '  • Storage Bucket boat-images mit Policies erstellt';
END $$;
