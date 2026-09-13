-- 134_order_refund_fields.sql
-- Widerruf / Rueckerstattung: Felder zum Nachhalten von Erstattungen.
--
-- Ablauf: Kaeufer widerruft innerhalb der Frist -> Stripe-Refund (inkl.
-- reverse_transfer, damit der an den Provider ueberwiesene Betrag zurueckgeholt
-- wird) -> Bestellung wird auf 'refunded' gesetzt.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS withdrawal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at             timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount           numeric(12,2),
  ADD COLUMN IF NOT EXISTS stripe_refund_id        text,
  ADD COLUMN IF NOT EXISTS refund_reason           text;

COMMENT ON COLUMN public.orders.withdrawal_requested_at IS
  'Zeitpunkt, zu dem der Kaeufer den Widerruf erklaert hat.';
COMMENT ON COLUMN public.orders.refunded_at IS
  'Zeitpunkt der erfolgreichen Rueckerstattung (Stripe-Refund).';

COMMIT;
