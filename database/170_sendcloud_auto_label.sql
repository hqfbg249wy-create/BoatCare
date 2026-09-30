-- 170_sendcloud_auto_label.sql
-- Sendcloud-Automatik: bei Versandbestaetigung automatisch ein Sendcloud-Paket
-- + Label erzeugen (Tracking zurueckschreiben). Steuerbar je Provider.
--
-- WICHTIG zur Versandkostenengine: Der KUNDENPREIS kommt unveraendert aus der
-- Skipily-Engine (provider_shipping_rules + calculate-shipping) und wird im
-- Deferred-Flow abgebucht. Sendcloud betrifft NUR das Fulfillment/Label und
-- aendert order.shipping_cost NICHT -> keine Kollision. Die Entscheidung
-- (Preis = Engine, Label = Sendcloud) ist im Provider-UI sichtbar.

-- Auto-Label je Provider (Default an, wenn Sendcloud verbunden ist).
ALTER TABLE public.provider_sendcloud
  ADD COLUMN IF NOT EXISTS auto_label boolean NOT NULL DEFAULT true;

-- Client darf das Flag lesen (Schreiben nur ueber Edge Function/service_role).
GRANT SELECT (auto_label) ON public.provider_sendcloud TO authenticated;

-- Label-URL + Sendcloud-Parcel-Id an der Bestellung (fuer Nachdruck/Referenz).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_label_url  text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sendcloud_parcel_id text;
