-- 164_inquiry_message_thread.sql
-- Alles zu einer Angebotsanfrage an EINEM Ort: Rueckfragen (messages) werden an
-- die Anfrage (service_inquiries) UND die daraus entstehende Bestellung (orders)
-- gekoppelt. Logik zentral in der DB:
--   * messages.related_inquiry_id + Auto-Link-Trigger (fuellt die jeweils
--     andere Seite aus service_inquiries.order_id automatisch).
--   * get_inquiry_thread(): kompletter Nachrichten-Thread einer Anfrage.
--   * inquiry_unread_counts(): Ungelesen-Zaehler je Anfrage/Order (fuer Badges).
--   * mark_inquiry_read(): Thread als gelesen markieren (Badge zuruecksetzen).

-- ── Spalte + Indizes ──
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS related_inquiry_id uuid REFERENCES public.service_inquiries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_related_inquiry ON public.messages(related_inquiry_id);
CREATE INDEX IF NOT EXISTS idx_messages_related_order ON public.messages(related_order_id);

-- ── Auto-Link: fehlende Seite (Anfrage<->Order) aus service_inquiries ableiten ──
CREATE OR REPLACE FUNCTION public.trg_message_link_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.related_inquiry_id IS NOT NULL AND NEW.related_order_id IS NULL THEN
    SELECT order_id INTO NEW.related_order_id
      FROM public.service_inquiries WHERE id = NEW.related_inquiry_id;
  ELSIF NEW.related_order_id IS NOT NULL AND NEW.related_inquiry_id IS NULL THEN
    SELECT id INTO NEW.related_inquiry_id
      FROM public.service_inquiries WHERE order_id = NEW.related_order_id LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_link_context ON public.messages;
CREATE TRIGGER messages_link_context
  BEFORE INSERT OR UPDATE OF related_inquiry_id, related_order_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_message_link_context();

-- Beim Anlegen einer Order aus einer Anfrage bestehende Rueckfragen der Anfrage
-- nachtraeglich mit der Order verknuepfen (Thread ist dann vollstaendig).
CREATE OR REPLACE FUNCTION public.trg_inquiry_order_backlink()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    UPDATE public.messages
      SET related_order_id = NEW.order_id
      WHERE related_inquiry_id = NEW.id AND related_order_id IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inquiry_order_backlink ON public.service_inquiries;
CREATE TRIGGER inquiry_order_backlink
  AFTER UPDATE OF order_id ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.trg_inquiry_order_backlink();

-- ── Berechtigung: ist der aktuelle Nutzer Teilnehmer der Anfrage? ──
CREATE OR REPLACE FUNCTION public.is_inquiry_participant(p_inquiry_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_inquiries i
    WHERE i.id = p_inquiry_id
      AND (
        i.owner_id = auth.uid()
        OR i.provider_id IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid())
      )
  );
$$;

-- ── Thread einer Anfrage (Rueckfragen + Antworten), chronologisch ──
CREATE OR REPLACE FUNCTION public.get_inquiry_thread(p_inquiry_id uuid)
RETURNS TABLE(
  id uuid, sender_id uuid, sender_type text, content text,
  is_read boolean, created_at timestamptz, is_mine boolean
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_inquiry_participant(p_inquiry_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT m.id, m.sender_id, m.sender_type, m.content, m.is_read, m.created_at,
           (m.sender_id = auth.uid()) AS is_mine
    FROM public.messages m
    WHERE m.related_inquiry_id = p_inquiry_id
    ORDER BY m.created_at ASC;
END $$;

-- ── Ungelesen-Zaehler je Anfrage/Order fuer den aktuellen Nutzer (Badges) ──
-- Ungelesen = Nachricht nicht von mir + is_read = false, in einer Anfrage, an
-- der ich (als Eigner ODER als Anbieter) beteiligt bin.
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
    AND m.sender_id <> auth.uid()
    AND (
      i.owner_id = auth.uid()
      OR i.provider_id IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid())
    )
  GROUP BY m.related_inquiry_id, m.related_order_id;
$$;

-- Gesamtzahl (fuer eine einzelne Badge-Zahl)
CREATE OR REPLACE FUNCTION public.inquiry_unread_total()
RETURNS bigint
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(unread), 0)::bigint FROM public.inquiry_unread_counts();
$$;

-- ── Thread als gelesen markieren (Badge zuruecksetzen) ──
CREATE OR REPLACE FUNCTION public.mark_inquiry_read(p_inquiry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_inquiry_participant(p_inquiry_id) THEN
    RETURN;
  END IF;
  UPDATE public.messages
    SET is_read = true
    WHERE related_inquiry_id = p_inquiry_id
      AND is_read = false
      AND sender_id <> auth.uid();
END $$;

GRANT EXECUTE ON FUNCTION public.is_inquiry_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inquiry_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inquiry_unread_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.inquiry_unread_total() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_read(uuid) TO authenticated;
