-- 137_inquiry_offers.sql
-- "Angebot-annehmen-und-bezahlen"-Bruecke: ein Anbieter kann auf eine Anfrage
-- (z.B. Tauwerk-Angebotsanfrage) ein strukturiertes Angebot mit Preis abgeben;
-- der Kunde nimmt es an und bezahlt ueber den bestehenden Stripe-Deferred-Flow
-- (Order + Connect-Transfer + Skipily-Provision). Damit laeuft JEDE tatsaechliche
-- Zahlung ueber Stripe.

BEGIN;

ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS offer_amount      numeric(12,2),
  ADD COLUMN IF NOT EXISTS offer_shipping    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offer_currency    text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS offer_description text,
  ADD COLUMN IF NOT EXISTS offer_status      text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS offer_created_at  timestamptz,
  ADD COLUMN IF NOT EXISTS order_id          uuid REFERENCES public.orders(id);

COMMENT ON COLUMN public.service_inquiries.offer_status IS
  '''none'' (kein Angebot) | ''offered'' (Anbieter hat Preis genannt) | ''accepted'' | ''declined'' | ''ordered'' (Bestellung erzeugt).';
COMMENT ON COLUMN public.service_inquiries.order_id IS
  'Die beim Annehmen erzeugte Bestellung (bezahlt via Stripe-Deferred-Flow).';

-- Provider (Owner/Mitglied) darf die Anfragen SEINES Betriebs lesen, damit das
-- Anbieter-Portal sie auflisten kann. Schreiben (Angebot abgeben) laeuft ueber
-- die Edge Function make-offer (service_role), daher hier nur SELECT.
DROP POLICY IF EXISTS "provider_select_own" ON public.service_inquiries;
CREATE POLICY "provider_select_own" ON public.service_inquiries
  FOR SELECT TO authenticated
  USING (public.provider_is_member(provider_id));

COMMIT;
