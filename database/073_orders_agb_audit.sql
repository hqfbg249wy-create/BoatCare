-- ============================================================================
-- Migration 073: AGB-Audit-Trail pro Bestellung
-- ============================================================================
-- Bei einem Marketplace-Kauf muss der Endkunde vor "Jetzt bezahlen" die
-- aktuell gültigen AGB akzeptiert haben — Klärung der Vermittler-Rolle,
-- Widerrufsbelehrung, etc. (§ 312k BGB).
--
-- Wir speichern pro Bestellung welche AGB-Version galt — wichtig falls
-- es später zu Streitfällen über Vertragsinhalte kommt.
--
-- Felder:
--   agb_accepted_version → Versionsstring (z.B. "2026-05")
--   agb_accepted_at      → Zeitpunkt der Annahme (i.d.R. = order created_at)
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS agb_accepted_version TEXT,
  ADD COLUMN IF NOT EXISTS agb_accepted_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.agb_accepted_version IS
  'AGB-Version die der Kunde bei dieser Bestellung akzeptiert hat (z.B. "2026-05"). Audit-Trail bei späteren AGB-Änderungen.';
COMMENT ON COLUMN public.orders.agb_accepted_at IS
  'Zeitpunkt der AGB-Annahme im Checkout. Meist identisch mit created_at, separat geführt für lückenloses Audit.';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 073: orders.agb_accepted_version + agb_accepted_at angelegt';
END $$;
