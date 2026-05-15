-- Migration 064: DELETE/UPDATE-Policies für provider_members und plus_family_members
--
-- Bisher gab es nur SELECT-Policies, deshalb scheitert das Entfernen oder
-- Rolle-Ändern eines Team-Mitglieds direkt aus dem Provider-Portal.

-- ─── provider_members: Owner darf Mitglieder verwalten ───────────────────
DROP POLICY IF EXISTS "Provider owner manages members" ON provider_members;
CREATE POLICY "Provider owner manages members" ON provider_members
  FOR ALL TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE service_providers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM service_providers WHERE service_providers.user_id = auth.uid()
    )
  );

-- Self-leave: jeder darf seine eigene Mitgliedschaft löschen
DROP POLICY IF EXISTS "Members can self-leave" ON provider_members;
CREATE POLICY "Members can self-leave" ON provider_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── plus_family_members: Owner darf Family-Mitglieder verwalten ─────────
DROP POLICY IF EXISTS "Family owner manages members" ON plus_family_members;
CREATE POLICY "Family owner manages members" ON plus_family_members
  FOR ALL TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM user_subscriptions WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    subscription_id IN (
      SELECT id FROM user_subscriptions WHERE owner_user_id = auth.uid()
    )
  );

-- ─── plus_fleet_boats: Owner darf Boote pflegen ─────────────────────────
DROP POLICY IF EXISTS "Fleet owner manages boats" ON plus_fleet_boats;
CREATE POLICY "Fleet owner manages boats" ON plus_fleet_boats
  FOR ALL TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM user_subscriptions WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    subscription_id IN (
      SELECT id FROM user_subscriptions WHERE owner_user_id = auth.uid()
    )
  );

-- Sanity
SELECT polname, polcmd FROM pg_policy
WHERE polrelid IN ('provider_members'::regclass,
                   'plus_family_members'::regclass,
                   'plus_fleet_boats'::regclass);
