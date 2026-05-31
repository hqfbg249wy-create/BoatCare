-- ============================================================================
-- Migration 069: profiles_role_check um 'provider' + 'customer' erweitern
-- ============================================================================
-- Schema-Drift-Fix:
--   Migration 042 erstellt den Provider-Signup-Trigger der INSERT in profiles
--   mit role='provider' macht.
--   Migration 043 hat aber profiles_role_check NUR auf
--   ('user','admin','admin_readonly') gesetzt.
--   → jeder Provider-Signup landet im Live-Mode in 500-Fehler:
--     "violates check constraint profiles_role_check"
--
-- Fix: Constraint inklusiv neu setzen.
-- 'customer' direkt mit aufnehmen — falls später noch ein Endkunden-Rolle
--   eingeführt wird, sind wir vorbereitet.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'admin_readonly', 'provider', 'customer'));

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 069: profiles_role_check erweitert um provider + customer';
END $$;
