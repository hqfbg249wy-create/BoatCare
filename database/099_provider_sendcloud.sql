-- Migration 099: Sendcloud-Versandintegration pro Provider
-- ============================================================================
-- Provider verbinden ihr eigenes Sendcloud-Konto per API-Schlüssel
-- (Public + Secret Key, erzeugt in Sendcloud unter
--  Einstellungen → Integrationen → Sendcloud API).
--
-- SICHERHEIT:
--   * Der Secret Key ist hoch sensibel. Er wird NUR serverseitig
--     (Edge Function `sendcloud-connect`, service_role) geschrieben/gelesen.
--   * Der Browser/Client darf den Secret Key NIEMALS lesen → spaltengenaue
--     GRANTs entziehen `authenticated` das SELECT-Recht auf `secret_key`.
--   * Alle Schreibvorgänge (connect/disconnect) laufen ausschließlich über die
--     Edge Function; der Client hat KEIN INSERT/UPDATE/DELETE. Er liest nur den
--     Status (verbunden ja/nein, Kontoname), um das UI zu rendern.
--   * anon hat gar keinen Zugriff.
-- ============================================================================

-- ── 1) Tabelle ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_sendcloud (
  provider_id     uuid PRIMARY KEY
                  REFERENCES public.service_providers(id) ON DELETE CASCADE,
  public_key      text,
  secret_key      text,                 -- nur service_role liest/schreibt
  account_name    text,                 -- von Sendcloud (Firmen-/Benutzername)
  account_email   text,
  status          text NOT NULL DEFAULT 'disconnected'
                  CHECK (status IN ('connected', 'disconnected', 'error')),
  connected_at    timestamptz,
  last_checked_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.provider_sendcloud IS
  'Sendcloud-Anbindung je Provider (API-Key). secret_key nur via service_role.';
COMMENT ON COLUMN public.provider_sendcloud.secret_key IS
  'Sendcloud Secret Key — NIE an authenticated/anon ausliefern.';

-- ── 2) Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.provider_sendcloud ENABLE ROW LEVEL SECURITY;

-- anon: keinerlei Zugriff.
REVOKE ALL ON public.provider_sendcloud FROM anon, public;

-- authenticated: nur LESEN, und zwar ohne die Geheimspalten. Spaltengenaue
-- GRANTs sorgen dafür, dass secret_key selbst bei versehentlichem
-- select('*') niemals mit ausgeliefert wird (PostgREST respektiert
-- Spaltenprivilegien). Schreiben ist ausschließlich der Edge Function
-- (service_role) vorbehalten.
GRANT SELECT (
  provider_id, public_key, account_name, account_email,
  status, connected_at, last_checked_at, last_error, created_at, updated_at
) ON public.provider_sendcloud TO authenticated;

GRANT ALL ON public.provider_sendcloud TO service_role;

-- SELECT nur für Owner/Mitglied des Betriebs oder Plattform-Admin.
DROP POLICY IF EXISTS provider_sendcloud_select ON public.provider_sendcloud;
CREATE POLICY provider_sendcloud_select ON public.provider_sendcloud
  FOR SELECT TO authenticated
  USING (public.provider_is_member(provider_id) OR public.is_admin());
-- Bewusst KEINE INSERT/UPDATE/DELETE-Policy für authenticated:
-- Verbinden/Trennen läuft nur über die Edge Function (service_role, umgeht RLS).

-- ── 3) updated_at pflegen ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_provider_sendcloud()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_provider_sendcloud ON public.provider_sendcloud;
CREATE TRIGGER trg_touch_provider_sendcloud
  BEFORE UPDATE ON public.provider_sendcloud
  FOR EACH ROW EXECUTE FUNCTION public.touch_provider_sendcloud();

-- PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
