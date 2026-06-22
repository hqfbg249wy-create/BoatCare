-- Migration 090: Shop-Pipeline-Stufe (Lead / Potenziell / Aktiv)
-- ============================================================================
-- Für die Admin-Shop-Übersicht: jeder Provider bekommt eine Pipeline-Stufe.
--
--   shop_stage = NULL   → "Auto": Stufe wird im Admin aus Signalen abgeleitet
--                         (aktiv = is_shop_active/Account beansprucht/Umsatz;
--                          potenziell = Shop-Check online_shop/maybe_shop;
--                          lead = sonst kontaktierbar).
--   shop_stage gesetzt  → manueller Override durch den Admin
--                         ('lead' | 'potential' | 'active').
--
-- AUTO-MARKIERUNG: Sobald ein Provider seinen Account aktiviert (nach der
-- CleverReach-Mail) — d.h. is_shop_active wird true, ODER user_id/claimed_at
-- werden erstmals gesetzt — setzt ein Trigger shop_stage automatisch auf
-- 'active'. Das überschreibt eine evtl. vorher gesetzte manuelle Stufe, weil
-- ein aktivierter Account fachlich immer "Aktiv" ist.
-- ============================================================================

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS shop_stage text
  CHECK (shop_stage IS NULL OR shop_stage IN ('lead', 'potential', 'active'));

COMMENT ON COLUMN public.service_providers.shop_stage IS
  'Pipeline-Stufe für die Shop-Übersicht. NULL=auto-abgeleitet, sonst manueller Override (lead|potential|active). Wird bei Account-Aktivierung automatisch auf active gesetzt.';

-- ── Auto-Markierung bei Account-Aktivierung ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_shop_stage_active()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.is_shop_active IS TRUE OR NEW.user_id IS NOT NULL OR NEW.claimed_at IS NOT NULL) THEN
      NEW.shop_stage := 'active';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Nur beim ÜBERGANG in den aktivierten Zustand (nicht bei jedem Update),
    -- damit ein späterer manueller Override des Admins erhalten bleibt.
    IF (NEW.is_shop_active IS TRUE AND OLD.is_shop_active IS DISTINCT FROM TRUE)
       OR (NEW.user_id   IS NOT NULL AND OLD.user_id   IS NULL)
       OR (NEW.claimed_at IS NOT NULL AND OLD.claimed_at IS NULL) THEN
      NEW.shop_stage := 'active';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mark_shop_stage_active ON public.service_providers;
CREATE TRIGGER trg_mark_shop_stage_active
  BEFORE INSERT OR UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.mark_shop_stage_active();
