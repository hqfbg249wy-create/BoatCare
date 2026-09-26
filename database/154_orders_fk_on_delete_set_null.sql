-- 154_orders_fk_on_delete_set_null.sql
-- Loeschen einer Bestellung schlug fehl, weil FKs auf orders(id) auf NO ACTION
-- standen und referenzierende Zeilen das Loeschen blockierten:
--   ERROR: update or delete on table "orders" violates foreign key constraint
--          "service_inquiries_order_id_fkey" on table "service_inquiries"
-- Beide betroffenen Referenzen (angenommene Anfrage + verknuepfte Nachricht)
-- auf ON DELETE SET NULL umstellen: die Bestellung laesst sich loeschen, die
-- Anfrage/Nachricht bleibt erhalten (nur die Verknuepfung wird geloest).
-- order_items haengt bereits per ON DELETE CASCADE, webhook_events per SET NULL.

ALTER TABLE public.service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_order_id_fkey;
ALTER TABLE public.service_inquiries
  ADD CONSTRAINT service_inquiries_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_related_order_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_related_order_id_fkey
  FOREIGN KEY (related_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
