-- 146_ensure_commission_rate.sql
-- Transaktionsgebuehr: 10 % ist Standard und muss ueberall real hinterlegt sein.
-- Nur fehlende/ungueltige Werte (NULL oder <= 0) auf 10 % setzen. Bestehende
-- Saetze bleiben unveraendert (insbesondere die 7 %-Fruehbucher aus claim-provider).

UPDATE public.service_providers
SET commission_rate = 10.00
WHERE commission_rate IS NULL OR commission_rate <= 0;

-- Ab jetzt ist ein Satz Pflicht (Default 10 %), damit nie 0/NULL entsteht und
-- beim Order-Charge keine Gebuehr verloren geht.
ALTER TABLE public.service_providers
  ALTER COLUMN commission_rate SET DEFAULT 10.00;

ALTER TABLE public.service_providers
  ALTER COLUMN commission_rate SET NOT NULL;
