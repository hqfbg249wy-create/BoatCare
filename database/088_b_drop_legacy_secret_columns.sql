-- Migration 088b: Alt-Spalten api_key + claim_token endgültig entfernen
-- ============================================================================
-- ⚠️ ERST AUSFÜHREN, NACHDEM 088a gelaufen UND der neue Code (Edge Functions
--    + provider-portal + admin-web) deployed & verifiziert ist.
--
-- Vorher prüfen (sollte 0 ergeben — alles ist nach provider_secrets gespiegelt):
--   SELECT count(*) FROM public.service_providers sp
--   LEFT JOIN public.provider_secrets ps ON ps.provider_id = sp.id
--   WHERE (sp.api_key     IS DISTINCT FROM ps.api_key)
--      OR (sp.claim_token IS DISTINCT FROM ps.claim_token);
-- ============================================================================

-- ── 1) Übergangs-Sync-Trigger entfernen ─────────────────────────────────────
DROP TRIGGER  IF EXISTS trg_sync_provider_secrets ON public.service_providers;
DROP FUNCTION IF EXISTS public.sync_provider_secrets();

-- ── 2) Schlanker Trigger: neue Provider bekommen automatisch eine
--       provider_secrets-Zeile (mit Default-claim_token) ─────────────────────
CREATE OR REPLACE FUNCTION public.create_provider_secrets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.provider_secrets (provider_id)
  VALUES (NEW.id)
  ON CONFLICT (provider_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_provider_secrets ON public.service_providers;
CREATE TRIGGER trg_create_provider_secrets
  AFTER INSERT ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.create_provider_secrets();

-- ── 3) Alt-Spalten droppen (schließt das öffentliche Leck) ──────────────────
-- DROP COLUMN bricht select('*') NICHT — es liefert nur weniger Spalten.
-- Der Unique-Index auf api_key wird automatisch mit entfernt.
ALTER TABLE public.service_providers DROP COLUMN IF EXISTS api_key;
ALTER TABLE public.service_providers DROP COLUMN IF EXISTS claim_token;
-- claim_token_created_at bleibt (nicht sensibel, harmlos).

NOTIFY pgrst, 'reload schema';
