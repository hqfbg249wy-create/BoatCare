-- =====================================================================
-- Add JSONB translations cache to metashop_products
--
-- Strategy B: Lazy auto-translation via Claude Edge Function.
-- Each product caches its translations in this column to avoid repeat
-- API calls. Structure:
--   {
--     "en": { "name": "Impeller Jabsco 1210-0001", "description": "..." },
--     "fr": { "name": "...", "description": "..." }
--   }
--
-- Provider may pre-fill manually via the Provider-Portal UI later.
-- =====================================================================

ALTER TABLE public.metashop_products
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS metashop_products_translations_gin
  ON public.metashop_products
  USING GIN (translations);

COMMENT ON COLUMN public.metashop_products.translations IS
  'Cached translations keyed by lang code (en/es/fr/it/nl) — populated by translate-product edge function';

-- Provider-Beschreibungen analog
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.service_providers.translations IS
  'Cached translations keyed by lang code — populated by translate-provider edge function';
