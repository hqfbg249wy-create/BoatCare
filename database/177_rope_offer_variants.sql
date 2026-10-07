-- 177_rope_offer_variants.sql
-- Strukturierte Tauwerk-Angebote: bis zu 3 Varianten je Anfrage mit Positionen.
-- Schreiben ausschliesslich ueber Edge Function make-rope-offer (service_role);
-- Lesen ueber SECURITY-DEFINER-RPC get_inquiry_offer (Owner ODER Provider-Mitglied).
-- Enden-Festpreise je Anbieter als wiederverwendbarer Katalog.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_offer_variants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id          uuid NOT NULL REFERENCES public.service_inquiries(id) ON DELETE CASCADE,
  provider_id         uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  title               text NOT NULL DEFAULT 'Variante',
  sort_order          integer NOT NULL DEFAULT 0,
  length_m            numeric(10,2),
  diameter_mm         numeric(10,2),
  material            text,
  end1                text,
  end2                text,
  material_product_id uuid REFERENCES public.metashop_products(id) ON DELETE SET NULL,
  material_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  currency            text NOT NULL DEFAULT 'EUR',
  discount_label      text,
  discount_type       text CHECK (discount_type IN ('percent','amount')),
  discount_value      numeric(12,2) NOT NULL DEFAULT 0,
  shipping_mode       text NOT NULL DEFAULT 'fixed' CHECK (shipping_mode IN ('fixed','engine')),
  shipping_cost       numeric(12,2) NOT NULL DEFAULT 0,
  subtotal            numeric(12,2) NOT NULL DEFAULT 0,
  total               numeric(12,2) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiry_offer_variants_inq_idx ON public.inquiry_offer_variants (inquiry_id, sort_order);

CREATE TABLE IF NOT EXISTS public.inquiry_offer_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id         uuid NOT NULL REFERENCES public.inquiry_offer_variants(id) ON DELETE CASCADE,
  kind               text NOT NULL DEFAULT 'custom' CHECK (kind IN ('material','end1','end2','custom')),
  label              text NOT NULL,
  qty                numeric(12,2) NOT NULL DEFAULT 1,
  unit_price         numeric(12,2) NOT NULL DEFAULT 0,
  line_total         numeric(12,2) NOT NULL DEFAULT 0,
  product_id         uuid REFERENCES public.metashop_products(id) ON DELETE SET NULL,
  product_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sort_order         integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS inquiry_offer_items_variant_idx ON public.inquiry_offer_items (variant_id, sort_order);

-- Wiederverwendbarer Enden-Preiskatalog je Anbieter.
CREATE TABLE IF NOT EXISTS public.provider_rope_end_prices (
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  end_option  text NOT NULL,
  price       numeric(12,2) NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'EUR',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, end_option)
);

ALTER TABLE public.inquiry_offer_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_offer_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_rope_end_prices ENABLE ROW LEVEL SECURITY;

-- Varianten/Items: KEIN direkter Client-Zugriff (Schreiben via service_role,
-- Lesen via get_inquiry_offer). Daher bewusst keine Policies.

-- Enden-Preise: Provider-Mitglieder verwalten die eigenen.
DROP POLICY IF EXISTS rope_end_prices_rw ON public.provider_rope_end_prices;
CREATE POLICY rope_end_prices_rw ON public.provider_rope_end_prices
  FOR ALL USING (public.provider_is_member(provider_id))
          WITH CHECK (public.provider_is_member(provider_id));

-- ── Lese-RPC: komplettes Angebot (Owner ODER Provider-Mitglied) ──
CREATE OR REPLACE FUNCTION public.get_inquiry_offer(p_inquiry_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inq record; v_ok boolean; v_out jsonb;
BEGIN
  SELECT id, owner_id, provider_id, offer_cover_letter, offer_status, offer_selected_variant_id
    INTO v_inq FROM public.service_inquiries WHERE id = p_inquiry_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ok := (v_inq.owner_id = auth.uid()) OR public.provider_is_member(v_inq.provider_id);
  IF NOT v_ok THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT jsonb_build_object(
    'inquiry_id', v_inq.id,
    'cover_letter', v_inq.offer_cover_letter,
    'offer_status', v_inq.offer_status,
    'selected_variant_id', v_inq.offer_selected_variant_id,
    'variants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'title', v.title, 'sort_order', v.sort_order,
        'length_m', v.length_m, 'diameter_mm', v.diameter_mm, 'material', v.material,
        'end1', v.end1, 'end2', v.end2,
        'material_product_id', v.material_product_id, 'material_variant_id', v.material_variant_id,
        'currency', v.currency, 'discount_label', v.discount_label,
        'discount_type', v.discount_type, 'discount_value', v.discount_value,
        'shipping_mode', v.shipping_mode, 'shipping_cost', v.shipping_cost,
        'subtotal', v.subtotal, 'total', v.total,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'kind', i.kind, 'label', i.label, 'qty', i.qty,
            'unit_price', i.unit_price, 'line_total', i.line_total,
            'product_id', i.product_id, 'product_variant_id', i.product_variant_id,
            'sort_order', i.sort_order) ORDER BY i.sort_order)
          FROM public.inquiry_offer_items i WHERE i.variant_id = v.id), '[]'::jsonb)
      ) ORDER BY v.sort_order)
      FROM public.inquiry_offer_variants v WHERE v.inquiry_id = v_inq.id), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION public.get_inquiry_offer(uuid) TO authenticated;

COMMIT;
