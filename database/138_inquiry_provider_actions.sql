-- 138_inquiry_provider_actions.sql
-- Anbieter-Aktionen auf Anfragen: ablehnen (offer_status='declined') und aus der
-- eigenen Liste entfernen (provider_archived). Die Anfrage gehoert dem Kunden,
-- daher wird sie beim "Loeschen" durch den Anbieter nur archiviert, nicht
-- geloescht. Schreiben laeuft ueber die Edge Function provider-inquiry-action
-- (service_role); hier nur die Spalte.

ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS provider_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_inquiries.provider_archived IS
  'Vom Anbieter aus seiner Anfragenliste entfernt (nicht fuer den Kunden).';
