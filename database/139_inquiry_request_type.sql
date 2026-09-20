-- 139_inquiry_request_type.sql
-- Zwei Arten von Anfragen aus der Ausruestung heraus:
--   'quote'   = Bitte um ein (verbindliches, bepreistes) Angebot
--   'inquiry' = unverbindliche Anfrage / Rueckfrage
-- Default 'quote' (bisheriges Verhalten der Angebotsanfrage).

ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'quote';

ALTER TABLE public.service_inquiries
  DROP CONSTRAINT IF EXISTS service_inquiries_request_type_check;
ALTER TABLE public.service_inquiries
  ADD CONSTRAINT service_inquiries_request_type_check
  CHECK (request_type IN ('quote', 'inquiry'));
