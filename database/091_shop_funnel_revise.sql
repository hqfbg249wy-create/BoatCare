-- Migration 091: Sales-Funnel-Neudefinition — Auto-Trigger entfernen
-- ============================================================================
-- Neue Funnel-Logik (in der Admin-Shop-Übersicht abgeleitet, live):
--   Aktiv      = nutzt den Shop wirklich (Produkte > 0 ODER Umsatz > 0)
--   Lead       = niedrigste Schwelle für Maßnahmen: Account aktiviert/
--                beansprucht ODER direkt angesprochen (CleverReach/Vertriebler),
--                aber noch KEINE Shop-Nutzung
--   Potenziell = vom Shop-Check als Shop erkannt, aber noch nicht engagiert
--
-- Damit ist „Account aktiviert" NICHT mehr automatisch „Aktiv" (sondern Lead).
-- Der in Migration 090 angelegte Trigger, der bei Aktivierung shop_stage='active'
-- setzte, widerspricht dem nun → wird entfernt. Die Stufe wird wieder rein
-- abgeleitet; shop_stage bleibt als reiner MANUELLER Override erhalten.
-- ============================================================================

DROP TRIGGER  IF EXISTS trg_mark_shop_stage_active ON public.service_providers;
DROP FUNCTION IF EXISTS public.mark_shop_stage_active();

-- Vom alten Trigger evtl. automatisch gesetzte Werte zurücknehmen, damit die
-- Stufe sauber abgeleitet wird. (Manuelle Overrides gab es noch keine — das
-- Feature war erst seit Kurzem live.) Ab jetzt ist shop_stage != NULL immer ein
-- bewusster Admin-Override.
UPDATE public.service_providers SET shop_stage = NULL WHERE shop_stage IS NOT NULL;

COMMENT ON COLUMN public.service_providers.shop_stage IS
  'Sales-Funnel-Stufe: NULL = automatisch abgeleitet (aktiv=Nutzung; lead=aktiviert/angesprochen ohne Nutzung; potenziell=erkannter Shop ohne Engagement). Gesetzt = manueller Admin-Override (lead|potential|active).';
