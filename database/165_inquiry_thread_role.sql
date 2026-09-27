-- 165_inquiry_thread_role.sql
-- get_inquiry_thread: is_mine rollenbasiert bestimmen. Grund: von Edge Functions
-- (make-offer, provider-inquiry-action) gespiegelte Anbieter-Nachrichten tragen
-- als sender_id die service_providers.id (Service-Role-Insert), nicht die
-- auth.users.id. Ein Vergleich sender_id = auth.uid() waere daher unzuverlaessig.
-- Stattdessen: Betrachter ist Eigner -> eigene Nachrichten sind sender_type
-- 'user'; Betrachter ist Anbieter -> eigene sind sender_type 'provider'.

CREATE OR REPLACE FUNCTION public.get_inquiry_thread(p_inquiry_id uuid)
RETURNS TABLE(
  id uuid, sender_id uuid, sender_type text, content text,
  is_read boolean, created_at timestamptz, is_mine boolean
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner    boolean;
  v_is_provider boolean;
BEGIN
  SELECT
    (i.owner_id = auth.uid()),
    (i.provider_id IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid()))
  INTO v_is_owner, v_is_provider
  FROM public.service_inquiries i
  WHERE i.id = p_inquiry_id;

  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_provider, false) THEN
    RETURN;   -- kein Teilnehmer
  END IF;

  RETURN QUERY
    SELECT m.id, m.sender_id, m.sender_type, m.content, m.is_read, m.created_at,
           ((v_is_owner AND m.sender_type = 'user') OR (v_is_provider AND m.sender_type = 'provider')) AS is_mine
    FROM public.messages m
    WHERE m.related_inquiry_id = p_inquiry_id
    ORDER BY m.created_at ASC;
END $$;

-- mark_inquiry_read: analog rollenbasiert (nicht die Gegenseite als gelesen
-- markieren). Ungelesen = Nachrichten der jeweils ANDEREN Rolle.
CREATE OR REPLACE FUNCTION public.mark_inquiry_read(p_inquiry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner    boolean;
  v_is_provider boolean;
BEGIN
  SELECT
    (i.owner_id = auth.uid()),
    (i.provider_id IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid()))
  INTO v_is_owner, v_is_provider
  FROM public.service_inquiries i
  WHERE i.id = p_inquiry_id;

  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_provider, false) THEN
    RETURN;
  END IF;

  UPDATE public.messages m
    SET is_read = true
    WHERE m.related_inquiry_id = p_inquiry_id
      AND m.is_read = false
      AND ( (v_is_owner AND m.sender_type = 'provider')
         OR (v_is_provider AND m.sender_type = 'user') );
END $$;

-- inquiry_unread_counts: Ungelesen = Nachrichten der jeweils anderen Rolle.
CREATE OR REPLACE FUNCTION public.inquiry_unread_counts()
RETURNS TABLE(inquiry_id uuid, order_id uuid, unread bigint)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.related_inquiry_id, m.related_order_id, count(*)::bigint
  FROM public.messages m
  JOIN public.service_inquiries i ON i.id = m.related_inquiry_id
  WHERE m.is_read = false
    AND (
      (i.owner_id = auth.uid() AND m.sender_type = 'provider')
      OR (i.provider_id IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid())
          AND m.sender_type = 'user')
    )
  GROUP BY m.related_inquiry_id, m.related_order_id;
$$;
