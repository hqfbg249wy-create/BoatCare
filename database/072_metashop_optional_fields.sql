-- ============================================================================
-- Migration 072: metashop_products — shop_url + manufacturer optional
-- ============================================================================
-- Schema-Drift Folge-Fix zu Migration 071. Nachdem shop_name nullable
-- gemacht wurde, kam beim Anlegen das nächste NOT-NULL-Feld zum Vorschein:
-- shop_url. Außerdem ist manufacturer für viele Produkte (z.B.
-- Eigenmarke "Generic Boat Polish") nicht zwingend.
--
-- Pflicht bleiben:
--   - name  (Produkt-Bezeichnung)
--   - price (Preis)
-- Diese werden im Provider-Portal-Formular abgefragt und sind logisch
-- für jedes Shop-Produkt notwendig.
-- ============================================================================

ALTER TABLE public.metashop_products
  ALTER COLUMN shop_url     DROP NOT NULL,
  ALTER COLUMN shop_url     SET DEFAULT '',
  ALTER COLUMN manufacturer DROP NOT NULL,
  ALTER COLUMN manufacturer SET DEFAULT '';

UPDATE public.metashop_products SET shop_url     = '' WHERE shop_url     IS NULL;
UPDATE public.metashop_products SET manufacturer = '' WHERE manufacturer IS NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 072: shop_url + manufacturer wieder optional (DEFAULT '''')';
END $$;
