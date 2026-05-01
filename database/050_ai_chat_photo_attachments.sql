-- ============================================================
-- Migration 050: Foto-Anhänge für AI-Chat
-- ============================================================
-- Erlaubt dem User, Fotos an seine Frage anzuhängen (z.B. defektes
-- Equipment, Schaden, Maße). Die KI bekommt die Bild-URLs übergeben
-- und kann die Inhalte mit Claudes Vision-Fähigkeiten interpretieren.
-- Die Anhänge werden zusammen mit der Nachricht in der Historie
-- gespeichert.
-- ============================================================

-- 1) Spalte für Foto-URLs an die Chat-Messages
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[];

COMMENT ON COLUMN public.ai_chat_messages.attachment_urls IS
  'Public-URLs der Foto-Anhänge im Bucket ai-chat-photos.';

-- 2) Storage-Bucket anlegen (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-chat-photos', 'ai-chat-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage-Policies: User darf nur in seinem eigenen Pfad operieren
--    Layout: ai-chat-photos/<user_id>/<random>.jpg
DO $$
BEGIN
  -- Insert (Upload)
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

  -- Public read (Bucket ist public, aber explizit absichern)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'ai_chat_photos_public_read'
  ) THEN
    CREATE POLICY "ai_chat_photos_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'ai-chat-photos');
  END IF;

  -- User darf eigene löschen
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
  RAISE NOTICE '✅ Migration 050: ai_chat_messages.attachment_urls + Bucket ai-chat-photos angelegt';
END $$;
