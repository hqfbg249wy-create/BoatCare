-- ============================================================
-- Migration 113: Gezielte Auth-User-Suche per E-Mail (für Claim)
-- ============================================================
-- claim-provider suchte bestehende Konten bisher via listUsers(perPage:200)
-- → ab >200 Nutzern würde ein bestehendes Konto übersehen (dann scheitert
-- der Claim an "E-Mail bereits vergeben"). Diese SECURITY-DEFINER-Funktion
-- liest auth.users gezielt per E-Mail (indexiert, O(1), skaliert beliebig).
--
-- Nur service_role darf sie ausführen (die Edge Function nutzt Service-Role).
-- ============================================================

CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

-- Ausführung strikt auf service_role beschränken (nicht anon/authenticated —
-- verhindert, dass jemand die Existenz beliebiger E-Mails abfragt).
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;
