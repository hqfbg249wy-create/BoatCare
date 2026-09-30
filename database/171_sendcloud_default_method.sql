-- 171_sendcloud_default_method.sql
-- Standard-Versandart (Sendcloud Shipping Method) je Betrieb. Wird genutzt,
-- wenn keine Sendcloud-Versandregel greift -> Label wird trotzdem erzeugt.
ALTER TABLE public.provider_sendcloud
  ADD COLUMN IF NOT EXISTS default_shipping_method_id integer,
  ADD COLUMN IF NOT EXISTS default_method_name text;
GRANT SELECT (default_shipping_method_id, default_method_name)
  ON public.provider_sendcloud TO authenticated;
