-- ============================================================================
-- Migration 074: order_items.product_id nullable + FK auf SET NULL
-- ============================================================================
-- Provider hat ein verkauftes Produkt gelöscht — schlug fehl wegen
--   1) FK order_items_product_id_fkey ON DELETE NO ACTION
--   2) product_id NOT NULL
-- → Produkt-Löschung im laufenden Betrieb war praktisch unmöglich.
--
-- Korrekte Architektur:
-- - order_items behält Snapshot (name, price, quantity) wie bei Anlage
-- - product_id ist nur eine optionale Referenz auf das Original
-- - Wenn Original gelöscht → product_id wird NULL, alle Bestelldaten
--   bleiben erhalten (bilanziell + DSGVO-konform Audit-Trail)
-- ============================================================================

-- 1) product_id darf NULL sein
ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;

-- 2) FK auf ON DELETE SET NULL umstellen
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.metashop_products(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 074: order_items.product_id jetzt nullable + FK SET NULL';
END $$;
