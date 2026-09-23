-- 149_product_variants.sql
-- Produktvarianten im Shop-Standard (Shopify-artig):
--   metashop_products.variant_options: definiert die Optionen + Werte je Produkt
--     Format: [{ "name": "Durchmesser", "values": ["6mm","8mm","10mm"] },
--              { "name": "Farbe", "values": ["Blau","Schwarz"] }]
--   product_variants: eine Zeile je konkreter Kombination mit eigenem
--     Preis/Bestand/SKU/Bild. attributes = {"Durchmesser":"6mm","Farbe":"Blau"}

ALTER TABLE public.metashop_products
  ADD COLUMN IF NOT EXISTS variant_options jsonb;

CREATE TABLE IF NOT EXISTS public.product_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.metashop_products(id) ON DELETE CASCADE,
  sku            text,
  attributes     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"Durchmesser":"6mm",...}
  price          numeric,          -- NULL = Produktpreis uebernehmen
  stock_quantity integer,
  in_stock       boolean NOT NULL DEFAULT true,
  image_url      text,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants (product_id, sort_order);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Oeffentlich lesbar (aktive Varianten aktiver Produkte) — wie der Shop.
DROP POLICY IF EXISTS product_variants_read ON public.product_variants;
CREATE POLICY product_variants_read ON public.product_variants
  FOR SELECT USING (
    is_active AND EXISTS (
      SELECT 1 FROM public.metashop_products p
      WHERE p.id = product_id AND p.is_active
    )
  );

-- Bestellpositionen: welche Variante wurde gekauft (fuer Anbieter + Rechnung).
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id  uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_sku text;

-- Schreiben nur durch Mitglieder des Betriebs, dem das Produkt gehoert.
DROP POLICY IF EXISTS product_variants_write ON public.product_variants;
CREATE POLICY product_variants_write ON public.product_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.metashop_products p
      WHERE p.id = product_id AND public.provider_is_member(p.provider_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.metashop_products p
      WHERE p.id = product_id AND public.provider_is_member(p.provider_id)
    )
  );
