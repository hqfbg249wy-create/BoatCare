-- 133_deferred_payment_workflow.sql
-- Neuer Shop-Zahlungsablauf: Zahlung wird von der Bestellung ENTKOPPELT.
--
-- Alt: Bestellung absenden -> sofortige Abbuchung + Transfer.
-- Neu: Bestellung absenden (Karte nur hinterlegt) -> Provider bestaetigt
--      Bestellung -> Provider bestaetigt Versand -> Rechnung inkl.
--      Widerrufsbelehrung -> Abbuchung (off-session) -> Auszahlung an Provider
--      + Fee an Skipily GmbH.
--
-- Diese Migration legt nur das Datenmodell an (Phase 1). Die Abbuchung/
-- Rechnungserzeugung erfolgt in Edge-Functions (Phase 2). Der alte Sofort-Flow
-- bleibt parallel nutzbar (Feature-Flag), erkennbar an orders.payment_flow.

BEGIN;

-- ── 1) Orders: Felder fuer den aufgeschobenen Zahlungsablauf ──
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_flow            text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id  text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS confirmed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS charged_at              timestamptz,
  ADD COLUMN IF NOT EXISTS charge_error            text,
  ADD COLUMN IF NOT EXISTS invoice_number          text,
  ADD COLUMN IF NOT EXISTS invoice_url             text,
  ADD COLUMN IF NOT EXISTS invoice_issued_at       timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_until        timestamptz;

COMMENT ON COLUMN public.orders.payment_flow IS
  '''immediate'' = alter Sofort-Zahlungs-Flow; ''deferred'' = Zahlung erst nach Versandbestaetigung.';
COMMENT ON COLUMN public.orders.stripe_payment_method_id IS
  'Bei ''deferred'': die vom Kaeufer bei Bestellung hinterlegte Zahlungsmethode fuer die spaetere off-session Abbuchung.';
COMMENT ON COLUMN public.orders.withdrawal_until IS
  'Ende der 14-taegigen Widerrufsfrist (ab Erhalt der Ware). Fuer Anzeige/Erstattungslogik.';

-- payment_status-Semantik bei ''deferred'':
--   'pending'  = Bestellung eingegangen, Karte hinterlegt, noch NICHT abgebucht
--   'paid'     = nach Versandbestaetigung off-session abgebucht
--   'failed'   = Abbuchung fehlgeschlagen (charge_error gesetzt, ggf. SCA noetig)
--   'refunded' = erstattet (z.B. Widerruf)

-- ── 2) Fortlaufende Rechnungsnummern je Provider (je Aussteller eigene Reihe) ──
-- Rechtlich muessen Rechnungsnummern je Rechnungssteller eindeutig und
-- (luecken-)fortlaufend sein. Jeder Provider ist eigener Verkaeufer -> eigene
-- Reihe, jaehrlich zuruecksetzend.
CREATE TABLE IF NOT EXISTS public.provider_invoice_counters (
  provider_id uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  year        int  NOT NULL,
  next_seq    bigint NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_invoice_counters ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policies: Zugriff nur ueber SECURITY DEFINER-Funktion / service_role.

-- Vergibt die naechste Rechnungsnummer atomar (Zeilensperre via UPDATE ->
-- race-safe bei parallelen Versandbestaetigungen). Format:
--   SK-<Jahr>-<Provider-Kuerzel 6 hex>-<laufend 5-stellig>, z.B. SK-2026-A1B2C3-00001
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_provider uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y   int := EXTRACT(YEAR FROM now())::int;
  seq bigint;
BEGIN
  IF p_provider IS NULL THEN
    RAISE EXCEPTION 'next_invoice_number: provider_id darf nicht NULL sein';
  END IF;

  -- Zeile anlegen, falls noch keine existiert.
  INSERT INTO public.provider_invoice_counters(provider_id, year, next_seq)
    VALUES (p_provider, y, 1)
  ON CONFLICT (provider_id) DO NOTHING;

  -- Jahreswechsel: Zaehler auf 1 zuruecksetzen. Sperrt die Zeile.
  UPDATE public.provider_invoice_counters
     SET next_seq = CASE WHEN year = y THEN next_seq ELSE 1 END,
         year     = y
   WHERE provider_id = p_provider;

  -- Aktuellen Wert nehmen und hochzaehlen (Zeile bereits gesperrt).
  UPDATE public.provider_invoice_counters
     SET next_seq   = next_seq + 1,
         updated_at = now()
   WHERE provider_id = p_provider
  RETURNING next_seq - 1 INTO seq;

  RETURN 'SK-' || y || '-'
         || upper(substr(replace(p_provider::text, '-', ''), 1, 6)) || '-'
         || lpad(seq::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC;
-- Nur service_role (Edge-Functions) darf Nummern ziehen.
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO service_role;

COMMIT;
