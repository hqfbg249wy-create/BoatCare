-- ============================================================================
-- Migration 070: Provider-AGB-Annahme als rechtssicherer Audit-Trail
-- ============================================================================
-- Skipily ist Vermittler-Plattform — Provider müssen vor erstem Verkauf
-- den Vendor Agreement / Provider-AGB akzeptieren. Wir speichern Zeitpunkt
-- + Version, damit später bei Streitfällen nachweisbar ist, welcher Stand
-- akzeptiert wurde.
--
-- Felder:
--   agb_accepted_at      → Timestamp der Annahme (NULL = noch nicht akzeptiert)
--   agb_accepted_version → Versionsstring (z.B. "2026-05" oder "v1.2")
--                          → erleichtert Audit bei späterer AGB-Anpassung
--
-- Update Signup-Trigger: liest agb_version aus user_metadata und überträgt es
-- direkt beim INSERT in service_providers (so wird bei Anmeldung über Portal
-- gleich beides gesetzt).
-- ============================================================================

-- ─── Schritt 1: Spalten anlegen ─────────────────────────────────────────────
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS agb_accepted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agb_accepted_version TEXT;

COMMENT ON COLUMN public.service_providers.agb_accepted_at IS
  'Zeitpunkt der AGB-Annahme durch den Provider. NULL = noch nicht akzeptiert. Sperrt Stripe-Onboarding solange NULL.';
COMMENT ON COLUMN public.service_providers.agb_accepted_version IS
  'Version der AGB die bei Annahme galt (z.B. "2026-05"). Für Audit-Trail bei späteren AGB-Updates.';


-- ─── Schritt 2: Signup-Trigger erweitern um AGB-Übertragung ─────────────────
-- Bisheriger Trigger setzt name/category/email/city/country.
-- Jetzt zusätzlich: agb_accepted_at + agb_accepted_version aus metadata.
CREATE OR REPLACE FUNCTION public.handle_new_provider_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'is_provider','false') = 'true' THEN

    -- 1) Profil sicherstellen
    INSERT INTO public.profiles (id, email, role, company_name)
    VALUES (NEW.id, NEW.email, 'provider',
            NEW.raw_user_meta_data->>'company_name')
    ON CONFLICT (id) DO UPDATE
      SET role = 'provider',
          company_name = COALESCE(EXCLUDED.company_name, public.profiles.company_name);

    -- 2) Provider-Zeile anlegen — inkl. AGB-Annahme aus metadata
    INSERT INTO public.service_providers (
      user_id, name, category, email, city, country,
      agb_accepted_at, agb_accepted_version
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'Neuer Provider'),
      COALESCE(NEW.raw_user_meta_data->>'category', 'repair'),
      NEW.email,
      NEW.raw_user_meta_data->>'city',
      COALESCE(NEW.raw_user_meta_data->>'country', 'Deutschland'),
      -- AGB-Felder: aus metadata, nur wenn beide vorhanden
      CASE
        WHEN NEW.raw_user_meta_data->>'agb_version' IS NOT NULL
        THEN NOW()
        ELSE NULL
      END,
      NEW.raw_user_meta_data->>'agb_version'
    );
  END IF;
  RETURN NEW;
END;
$$;


-- ─── Schritt 3: RPC für nachträgliche Annahme (Bestandskunden / Profile-Page) ─
CREATE OR REPLACE FUNCTION public.accept_provider_agb(p_version TEXT)
RETURNS public.service_providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.service_providers;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.service_providers
     SET agb_accepted_at      = NOW(),
         agb_accepted_version = p_version,
         updated_at           = NOW()
   WHERE user_id = uid
   RETURNING * INTO row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kein verknüpfter Provider gefunden';
  END IF;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_provider_agb(TEXT) TO authenticated;


DO $$
BEGIN
  RAISE NOTICE '✅ Migration 070: Provider-AGB-Annahme + Audit-Trail aktiv';
END $$;
