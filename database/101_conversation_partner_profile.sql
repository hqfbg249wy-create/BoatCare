-- Migration 101: Konversationspartner-Profil sichtbar (Name statt "Unbekannt")
-- ============================================================================
-- Der Provider konnte den Namen/E-Mail des Eigners nicht sehen (RLS auf
-- profiles) → im Nachrichten-Thread stand "Unbekannt". Diese Policy erlaubt
-- dem Provider das Lesen NUR jener Eigner-Profile, mit denen er tatsächlich
-- eine Konversation hat. Rein additive SELECT-Policy, minimaler Scope.
-- ============================================================================

DROP POLICY IF EXISTS "profiles_visible_to_conversation_partner" ON public.profiles;
CREATE POLICY "profiles_visible_to_conversation_partner" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT c.user_id
      FROM public.conversations c
      JOIN public.service_providers sp ON sp.id = c.provider_id
      WHERE sp.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
