-- 141_inquiry_owner_archived.sql
-- Archiv-Flag fuer den Eigner (Kunden-Seite). Erlaubt "nach rechts wischen =
-- archivieren" in der App, ohne die Anfrage zu loeschen. Getrennt vom
-- provider_archived (Anbieter-Seite).

ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS owner_archived boolean NOT NULL DEFAULT false;
