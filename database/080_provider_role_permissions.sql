-- Migration 080: Echte Rollen-Rechte für Provider-Team-Mitglieder
--
-- Rollenmodell (provider_members.role: 'admin' | 'member', plus Owner):
--   Owner + Admin: alles (Profil, Team, API, Versand, Produkte, Bestellungen)
--   Member:        nur Produkte + Bestellungen bearbeiten
--
-- Umsetzung über zwei SECURITY-DEFINER-Helper + rollenabhängige RLS-Policies.

-- ─── Helper: Owner ODER irgendein Mitglied? ──────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_is_member(pid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM service_providers WHERE id = pid AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM provider_members  WHERE provider_id = pid AND user_id = auth.uid());
$$;

-- ─── Helper: Owner ODER Admin-Mitglied? ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_is_admin(pid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM service_providers WHERE id = pid AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM provider_members  WHERE provider_id = pid AND user_id = auth.uid() AND role = 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.provider_is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_is_admin(uuid)  TO authenticated;

-- ─── Produkte: alle Mitglieder dürfen verwalten ──────────────────────────
DROP POLICY IF EXISTS "metashop_products_provider_manage" ON metashop_products;
CREATE POLICY "metashop_products_provider_manage" ON metashop_products
  FOR ALL TO authenticated
  USING (provider_is_member(provider_id))
  WITH CHECK (provider_is_member(provider_id));

-- ─── Bestellungen: Mitglieder dürfen bearbeiten (Status/Tracking) ────────
DROP POLICY IF EXISTS "orders_provider_update" ON orders;
CREATE POLICY "orders_provider_update" ON orders
  FOR UPDATE TO authenticated
  USING (provider_is_member(provider_id))
  WITH CHECK (provider_is_member(provider_id));

-- ─── Profil/Stammdaten (inkl. api_key, webhook_url): nur Owner + Admin ────
DROP POLICY IF EXISTS "providers_self_update" ON service_providers;
CREATE POLICY "providers_self_update" ON service_providers
  FOR UPDATE TO authenticated
  USING (provider_is_admin(id))
  WITH CHECK (provider_is_admin(id));

-- ─── Team-Verwaltung: nur Owner + Admin ──────────────────────────────────
DROP POLICY IF EXISTS "Provider owner manages members" ON provider_members;
DROP POLICY IF EXISTS "Provider admin manages members" ON provider_members;
CREATE POLICY "Provider admin manages members" ON provider_members
  FOR ALL TO authenticated
  USING (provider_is_admin(provider_id))
  WITH CHECK (provider_is_admin(provider_id));
-- Self-leave-Policy aus 064 bleibt bestehen (jeder darf sich selbst entfernen).

-- ─── Versandregeln: nur Owner + Admin (+ Plattform-Admin) ────────────────
DROP POLICY IF EXISTS shipping_rules_owner ON provider_shipping_rules;
CREATE POLICY shipping_rules_owner ON provider_shipping_rules
  FOR ALL TO authenticated
  USING (
    provider_is_admin(provider_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    provider_is_admin(provider_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
