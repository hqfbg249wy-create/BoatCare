-- Migration 087: Sicherheits-Härtung (kritische Lücken schließen)
--
-- Alle Punkte wurden LIVE über den öffentlichen anon-Key verifiziert:
--   1) service_providers war für JEDEN (anon) schreibbar  → Daten-Manipulation
--      und Profil-Übernahme (user_id kapern, Provision/Stripe ändern).
--   2) api_key (Orders-API-Schlüssel) und claim_token waren öffentlich lesbar
--      → fremde Bestellungen per API steuerbar, fremde Profile claimbar.
--   3) Nutzer konnten ihre eigene profiles.role auf 'admin' setzen
--      (Update-Policy ohne WITH CHECK) → Rechte-Eskalation.

-- =====================================================================
-- 1) service_providers — Schreibrechte korrekt absichern
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can update providers"            ON public.service_providers;
DROP POLICY IF EXISTS "Anyone can insert providers"            ON public.service_providers;
DROP POLICY IF EXISTS "Authenticated users can insert providers" ON public.service_providers;

-- INSERT: nur eingeloggte Nutzer (Owner-Portal „Betrieb hinzufügen") + Admin.
-- Der Scraper schreibt mit service_role und umgeht RLS ohnehin.
DROP POLICY IF EXISTS "service_providers_insert_auth" ON public.service_providers;
CREATE POLICY "service_providers_insert_auth" ON public.service_providers
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: nur Owner/Mitglied des Betriebs ODER Plattform-Admin.
DROP POLICY IF EXISTS "service_providers_update_owner_admin" ON public.service_providers;
CREATE POLICY "service_providers_update_owner_admin" ON public.service_providers
  FOR UPDATE TO authenticated
  USING (public.provider_is_member(id) OR public.is_admin())
  WITH CHECK (public.provider_is_member(id) OR public.is_admin());

-- DELETE: nur Owner/Mitglied ODER Admin.
DROP POLICY IF EXISTS "service_providers_delete_owner_admin" ON public.service_providers;
CREATE POLICY "service_providers_delete_owner_admin" ON public.service_providers
  FOR DELETE TO authenticated
  USING (public.provider_is_member(id) OR public.is_admin());

-- HINWEIS: Das Verbergen sensibler Spalten (api_key, claim_token) erfolgt
-- NICHT hier per Spalten-REVOKE — die Apps nutzen flächendeckend
-- service_providers.select('*'), das würde brechen. Diese Spalten werden in
-- Migration 088 in eine separate, streng abgesicherte Tabelle ausgelagert.

-- =====================================================================
-- 2) profiles.role-Eskalation verhindern
--    Ein Nutzer darf seine Stammdaten ändern, aber NICHT seine Rolle.
--    Rollen ändern nur Admins oder der Service-Role (Edge Functions).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'service_role' OR public.is_admin() THEN
      RETURN NEW;  -- Admin / Service-Role dürfen Rollen setzen
    END IF;
    RAISE EXCEPTION 'Rollenänderung nicht erlaubt';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
