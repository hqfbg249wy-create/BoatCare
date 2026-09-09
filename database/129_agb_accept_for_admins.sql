-- 129_agb_accept_for_admins.sql
-- AGB-Annahme auch für Admin-Team-Mitglieder (nicht nur Owner).
--
-- Bisher: accept_provider_agb(p_version) UPDATE ... WHERE user_id = auth.uid()
-- → nur der Owner konnte akzeptieren. Ein Admin-Mitglied sah im Portal den
-- AGB-Button, bekam aber "kein verknüpfter Provider gefunden".
--
-- Neu: accept_provider_agb(p_version, p_provider_id) — autorisiert über
-- provider_is_admin() (Owner ODER Admin-Mitglied, dieselbe Schranke wie
-- Profil/Stammdaten). Plain 'member' bleibt aussen vor (nur Produkte/Bestellungen).

BEGIN;

-- Alte 1-Argument-Variante entfernen (sonst Overload-Mehrdeutigkeit in PostgREST).
DROP FUNCTION IF EXISTS public.accept_provider_agb(TEXT);

CREATE OR REPLACE FUNCTION public.accept_provider_agb(
  p_version     TEXT,
  p_provider_id UUID DEFAULT NULL
)
RETURNS public.service_providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid := auth.uid();
  target uuid;
  row    public.service_providers;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Ziel-Betrieb: explizit übergeben, sonst der eigene Owner-Betrieb (rückwärtskompatibel).
  IF p_provider_id IS NOT NULL THEN
    target := p_provider_id;
  ELSE
    SELECT id INTO target FROM public.service_providers WHERE user_id = uid LIMIT 1;
  END IF;

  IF target IS NULL THEN
    RAISE EXCEPTION 'kein verknüpfter Provider gefunden';
  END IF;

  -- Rechte: Owner ODER Admin-Mitglied.
  IF NOT public.provider_is_admin(target) THEN
    RAISE EXCEPTION 'keine Berechtigung (nur Inhaber oder Admin-Mitglied)';
  END IF;

  UPDATE public.service_providers
     SET agb_accepted_at      = NOW(),
         agb_accepted_version = p_version,
         updated_at           = NOW()
   WHERE id = target
   RETURNING * INTO row;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_provider_agb(TEXT, UUID) TO authenticated;

COMMIT;
