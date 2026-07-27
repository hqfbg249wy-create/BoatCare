-- ============================================================
-- Migration 119: is_verified-Spalte in service_providers
-- ============================================================
-- Wird von der Claim-Funktion (claim-provider) gesetzt und als
-- Vertrauens-Badge im Eigner-Portal / öffentlichen Profil gelesen.
-- Migration 010 war auf der Live-DB nie eingespielt → Claim schlug
-- fehl ("Could not find the 'is_verified' column").
--
-- WICHTIG: KEIN Blanket-Backfill auf TRUE (anders als das alte 010).
-- Gescrapte/importierte Provider sollen NICHT automatisch als
-- verifiziert gelten. TRUE wird nur beim aktiven Claim gesetzt
-- (bzw. per Admin). Geclaimte Provider zeigen das Badge ohnehin
-- über user_id.
-- ============================================================

ALTER TABLE public.service_providers
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_service_providers_is_verified
    ON public.service_providers (is_verified);

-- PostgREST-Schema-Cache neu laden, damit die Spalte sofort verfügbar ist.
NOTIFY pgrst, 'reload schema';
