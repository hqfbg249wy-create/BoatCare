-- Migration 102: Konversationen archivieren (je Seite, ohne Löschen)
-- ============================================================================
-- "Historisieren": Eigner bzw. Provider kann eine Konversation aus seiner
-- aktiven Liste ausblenden, ohne sie beim Gegenüber zu entfernen. Zwei
-- unabhängige Flags — jede Seite steuert nur ihre eigene Ansicht.
-- Bestehende Teilnehmer-RLS (FOR ALL) erlaubt das UPDATE bereits.
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS owner_archived    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_archived boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
