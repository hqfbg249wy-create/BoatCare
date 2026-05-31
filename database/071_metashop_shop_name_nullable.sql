-- ============================================================================
-- Migration 071: metashop_products.shop_name wieder optional
-- ============================================================================
-- Schema-Drift-Fix:
--   Migration 025 erstellt metashop_products mit
--     shop_name TEXT DEFAULT ''
--   Irgendwann wurde NOT NULL hinzugefügt (vermutlich beim Vendor-Shop-
--   Refactor in 028), aber das Default '' wurde nicht erhalten.
--   → beim Anlegen eines Produkts ohne explizit gesetztes shop_name:
--     "null value in column shop_name violates not-null constraint"
--
-- Lösung:
--   - NOT NULL droppen (Provider-Name ist eh aus service_providers verknüpft)
--   - DEFAULT '' explizit setzen, falls Code irgendwo doch NULL sendet
--   - Bestehende NULL-Werte normalisieren
--
-- Semantik: shop_name war ursprünglich eine optionale Anzeige-Spalte
-- (z.B. "Werft Hamburg · Spare-Parts-Abteilung") — in den meisten Fällen
-- reicht service_providers.name. Optional bleibt sinnvoll.
-- ============================================================================

ALTER TABLE public.metashop_products
  ALTER COLUMN shop_name DROP NOT NULL,
  ALTER COLUMN shop_name SET DEFAULT '';

UPDATE public.metashop_products SET shop_name = '' WHERE shop_name IS NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 071: metashop_products.shop_name wieder optional (DEFAULT '''')';
END $$;
