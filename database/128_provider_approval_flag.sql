-- 128_provider_approval_flag.sql
-- Sauberes Genehmigungs-Flag für Betriebe.
--
-- Bisher missbrauchte das Admin-Panel `user_id IS NOT NULL` als "neu, muss
-- genehmigt werden" und setzte beim Genehmigen `user_id = NULL`. Das erfasste
-- JEDEN Betrieb mit Owner (Testprovider, geclaimte Betriebe) dauerhaft und
-- hätte beim Genehmigen die Eigentümer-Verknüpfung zerstört.
--
-- Richtig: ein eigenes Flag `is_approved`. Neu von Nutzern eingereichte Betriebe
-- (AddBusinessModal) kommen mit is_approved=false rein; der Admin setzt true.
-- Provider-EIGENE Änderungen (Provider-Portal) laufen direkt und unabhängig
-- davon; EXTERNE Änderungsvorschläge laufen weiter über provider_edit_suggestions.
--
-- `submitted_by` merkt sich, wer den Betrieb eingereicht hat (Owner bleibt user_id).

BEGIN;

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS is_approved  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Bestandsbetriebe gelten als genehmigt (Default true deckt das ab; explizit
-- für evtl. vorhandene NULLs, falls die Spalte früher ohne Default kam).
UPDATE service_providers SET is_approved = true WHERE is_approved IS NULL;

-- Schneller Zugriff auf die (wenigen) offenen Einreichungen.
CREATE INDEX IF NOT EXISTS service_providers_pending_idx
  ON service_providers (created_at DESC) WHERE is_approved = false;

COMMIT;
