-- Migration 104: Bildanhänge an Nachrichten
-- ============================================================================
-- Bei Anfragen sind Fotos oft entscheidend (Problem schwer zu beschreiben).
-- Die Fotos werden in den Bucket user-photos hochgeladen; ihre öffentlichen
-- URLs landen hier, damit Provider-Portal UND iOS sie im Verlauf anzeigen.
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_urls text[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
