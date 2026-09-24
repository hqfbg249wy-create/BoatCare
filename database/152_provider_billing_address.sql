-- 152_provider_billing_address.sql
-- Optionale, abweichende Rechnungsadresse je Anbieter. Wenn aktiviert, dient
-- sie als Absenderadresse auf Rechnung + E-Rechnung (statt der Betriebs-/
-- Standortadresse street/postal_code/city/country).

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS billing_address_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_name        text,   -- abw. Firmen-/Rechnungsname (optional)
  ADD COLUMN IF NOT EXISTS billing_street      text,
  ADD COLUMN IF NOT EXISTS billing_postal_code text,
  ADD COLUMN IF NOT EXISTS billing_city        text,
  ADD COLUMN IF NOT EXISTS billing_country     text;

COMMENT ON COLUMN public.service_providers.billing_address_enabled IS
  'Wenn true: billing_* wird als Absenderadresse auf Rechnung/E-Rechnung verwendet.';
