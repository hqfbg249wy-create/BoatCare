-- Migration 103: UPDATE-Policy auf messages (is_read setzen)
-- ============================================================================
-- Bug: Auf messages gab es nur SELECT- und INSERT-Policies, KEINE für UPDATE.
-- Dadurch schlug das Markieren als gelesen (is_read = true) still fehl (RLS,
-- 0 Zeilen betroffen) → der Ungelesen-Zähler kam nach dem Öffnen zurück.
-- Diese Policy erlaubt Teilnehmern der Konversation das UPDATE.
-- ============================================================================

DROP POLICY IF EXISTS "messages_update_participant" ON public.messages;
CREATE POLICY "messages_update_participant" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE user_id = auth.uid()
      OR provider_id IN (
        SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE user_id = auth.uid()
      OR provider_id IN (
        SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';
