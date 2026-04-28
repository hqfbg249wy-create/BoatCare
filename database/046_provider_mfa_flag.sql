-- ============================================================
-- Migration 046: mfa_required-Flag für service_providers + profiles
-- ============================================================
-- Erlaubt Admin/Provider, optionale 2FA-Pflicht zu aktivieren.
-- Das Provider-Portal erzwingt dann nach Login eine MFA-Enrollment, falls
-- der User noch kein TOTP-Faktor hat.
-- ============================================================

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_providers.mfa_required IS
  'Wenn true, erzwingt das Provider-Portal nach Login eine TOTP-Enrollment.';
COMMENT ON COLUMN public.profiles.mfa_required IS
  'Wenn true, wird im jeweiligen Portal eine MFA-Enrollment erzwungen.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 046: mfa_required-Spalten aktiv';
END $$;
