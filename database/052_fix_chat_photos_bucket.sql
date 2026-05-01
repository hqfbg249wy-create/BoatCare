-- ============================================================
-- Migration 052: Bucket ai-chat-photos auf public setzen
-- ============================================================
-- Migration 050 nutzte ON CONFLICT DO NOTHING — falls der Bucket
-- bereits existierte (public=false), wurde er nicht auf public=true
-- gesetzt. Das verhindert, dass Bilder von außen (Edge Function /
-- Claude) gelesen werden können.
-- ============================================================

-- Bucket sicherstellen: anlegen ODER auf public setzen
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-chat-photos',
  'ai-chat-photos',
  true,
  10485760,   -- 10 MB pro Foto
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- column sicherstellen (falls 050 nicht lief)
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[];

-- Storage-Policies sicherstellen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'ai_chat_photos_user_insert'
  ) THEN
    CREATE POLICY "ai_chat_photos_user_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'ai-chat-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'ai_chat_photos_public_read'
  ) THEN
    CREATE POLICY "ai_chat_photos_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'ai-chat-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'ai_chat_photos_user_delete'
  ) THEN
    CREATE POLICY "ai_chat_photos_user_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'ai-chat-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 052: Bucket ai-chat-photos ist jetzt public=true, Policies geprüft.';
END $$;
