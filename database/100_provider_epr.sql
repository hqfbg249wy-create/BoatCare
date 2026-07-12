-- Migration 100: EPR-/LUCID-Registrierungsnummer je Provider
-- ============================================================================
-- Viele Marktplätze und die EU-Verpackungsverordnung (EPR) verlangen, dass
-- Händler ihre Verpackungsregister-Nummer (z. B. LUCID in Deutschland)
-- hinterlegen. Wird wie die übrigen Stammdaten in service_providers gespeichert
-- und über das Provider-Portal (Owner/Admin) gepflegt.
--
-- Rein additive Spalte — keine Auswirkung auf bestehende Daten, RLS oder Rollen.
-- ============================================================================

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS epr_registration_number text;

COMMENT ON COLUMN public.service_providers.epr_registration_number IS
  'LUCID-/EPR-Verpackungsregister-Nummer des Providers (optional, Stammdaten).';

-- PostgREST Schema-Cache neu laden, damit die Spalte sofort les-/schreibbar ist
NOTIFY pgrst, 'reload schema';
