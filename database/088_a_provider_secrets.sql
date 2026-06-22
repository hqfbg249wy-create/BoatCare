-- Migration 088a: Sensible Provider-Geheimnisse aus service_providers auslagern
-- ============================================================================
-- PROBLEM (live über anon-Key verifiziert):
--   service_providers.api_key (Orders-/Products-API-Schlüssel) und
--   service_providers.claim_token (Profil-Übernahme-Token) waren ÖFFENTLICH
--   lesbar, weil auf der Tabelle eine anon-SELECT-Policy USING(true) liegt und
--   alle Apps service_providers.select('*') nutzen.
--
-- LÖSUNG: Beide Spalten in eine separate Tabelle `provider_secrets` auslagern,
--   die NUR Owner/Mitglied/Admin (authenticated) bzw. die Edge Functions
--   (service_role) lesen dürfen. anon hat KEINEN Zugriff.
--
-- STAGED ROLLOUT (kein Downtime/Bruch-Risiko):
--   088a (DIESE Datei) — Tabelle + Backfill + RLS + SYNC-Trigger.
--     Die Alt-Spalten bleiben vorerst erhalten; ein Trigger spiegelt jede
--     Änderung an service_providers.api_key/claim_token nach provider_secrets.
--     → Alter UND neuer Code laufen gleichzeitig korrekt.
--   Danach: neuen Code deployen (Edge Functions + Portale).
--   088b — erst dann die Alt-Spalten aus service_providers droppen
--     (schließt das Leck endgültig).
-- ============================================================================

-- ── 1) Secrets-Tabelle ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_secrets (
  provider_id  uuid PRIMARY KEY
               REFERENCES public.service_providers(id) ON DELETE CASCADE,
  api_key      text UNIQUE,
  claim_token  uuid DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_secrets_claim_token
  ON public.provider_secrets (claim_token) WHERE claim_token IS NOT NULL;

-- ── 2) Backfill aus den Bestandsspalten ─────────────────────────────────────
INSERT INTO public.provider_secrets (provider_id, api_key, claim_token)
SELECT id, api_key, COALESCE(claim_token, gen_random_uuid())
FROM public.service_providers
ON CONFLICT (provider_id) DO NOTHING;

-- ── 3) Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.provider_secrets ENABLE ROW LEVEL SECURITY;

-- anon: KEIN Zugriff (kein GRANT, explizit entzogen falls Default-Privileg)
REVOKE ALL ON public.provider_secrets FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON public.provider_secrets TO authenticated;
GRANT ALL    ON public.provider_secrets TO service_role;

-- SELECT/INSERT/UPDATE nur Owner/Mitglied des Betriebs ODER Plattform-Admin.
-- (service_role umgeht RLS ohnehin → Edge Functions lesen/schreiben frei.)
DROP POLICY IF EXISTS provider_secrets_select ON public.provider_secrets;
CREATE POLICY provider_secrets_select ON public.provider_secrets
  FOR SELECT TO authenticated
  USING (public.provider_is_member(provider_id) OR public.is_admin());

DROP POLICY IF EXISTS provider_secrets_insert ON public.provider_secrets;
CREATE POLICY provider_secrets_insert ON public.provider_secrets
  FOR INSERT TO authenticated
  WITH CHECK (public.provider_is_member(provider_id) OR public.is_admin());

DROP POLICY IF EXISTS provider_secrets_update ON public.provider_secrets;
CREATE POLICY provider_secrets_update ON public.provider_secrets
  FOR UPDATE TO authenticated
  USING (public.provider_is_member(provider_id) OR public.is_admin())
  WITH CHECK (public.provider_is_member(provider_id) OR public.is_admin());
-- Kein DELETE-Policy: Löschung läuft über ON DELETE CASCADE.

-- ── 4) Sync-Trigger (nur während des Übergangs aktiv) ───────────────────────
-- Hält provider_secrets konsistent, solange die Alt-Spalten noch beschrieben
-- werden (alter Code / Deploy-Fenster). Wird in 088b ersetzt.
CREATE OR REPLACE FUNCTION public.sync_provider_secrets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.provider_secrets (provider_id, api_key, claim_token)
  VALUES (NEW.id, NEW.api_key, COALESCE(NEW.claim_token, gen_random_uuid()))
  ON CONFLICT (provider_id) DO UPDATE
    SET api_key     = COALESCE(EXCLUDED.api_key,     public.provider_secrets.api_key),
        claim_token = COALESCE(EXCLUDED.claim_token, public.provider_secrets.claim_token),
        updated_at  = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_provider_secrets ON public.service_providers;
CREATE TRIGGER trg_sync_provider_secrets
  AFTER INSERT OR UPDATE OF api_key, claim_token ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.sync_provider_secrets();

-- PostgREST Schema-Cache neu laden (damit Embeds/RLS sofort greifen)
NOTIFY pgrst, 'reload schema';
