-- 166_post_inquiry_message.sql
-- Eine Antwort in den Anfrage-Thread schreiben - fuer Kunde UND Anbieter, mit
-- korrekter Rolle (sender_type) und Kopplung an die Anfrage (related_inquiry_id).
-- Loest/erzeugt die Konversation und aktualisiert last_message_at. Zentral in
-- der DB, damit alle Frontends denselben Weg nutzen.

CREATE OR REPLACE FUNCTION public.post_inquiry_message(p_inquiry_id uuid, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner    uuid;
  v_provider uuid;
  v_is_owner boolean;
  v_is_prov  boolean;
  v_conv     uuid;
  v_sender_type text;
  v_msg_id   uuid;
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Leere Nachricht';
  END IF;

  SELECT i.owner_id, i.provider_id INTO v_owner, v_provider
  FROM public.service_inquiries i WHERE i.id = p_inquiry_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Anfrage nicht gefunden'; END IF;

  v_is_owner := (v_owner = auth.uid());
  v_is_prov  := (v_provider IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid()));
  IF NOT v_is_owner AND NOT v_is_prov THEN
    RAISE EXCEPTION 'Kein Teilnehmer dieser Anfrage';
  END IF;
  v_sender_type := CASE WHEN v_is_owner THEN 'user' ELSE 'provider' END;

  -- Konversation (user <-> provider) finden oder anlegen.
  SELECT id INTO v_conv FROM public.conversations
    WHERE user_id = v_owner AND provider_id = v_provider LIMIT 1;
  IF v_conv IS NULL THEN
    INSERT INTO public.conversations (user_id, provider_id)
      VALUES (v_owner, v_provider) RETURNING id INTO v_conv;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, sender_type, content, related_inquiry_id)
    VALUES (v_conv, auth.uid(), v_sender_type, btrim(p_content), p_inquiry_id)
    RETURNING id INTO v_msg_id;

  UPDATE public.conversations SET last_message_at = now() WHERE id = v_conv;
  RETURN v_msg_id;
END $$;

GRANT EXECUTE ON FUNCTION public.post_inquiry_message(uuid, text) TO authenticated;
