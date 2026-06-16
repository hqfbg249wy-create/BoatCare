-- Migration 081: Plattform-Admins dürfen provider_members lesen
--
-- Das Admin-Tool zeigt die Team-Struktur eines Providers an. Es nutzt die
-- Admin-Session (nicht Service-Role), daher braucht es eine SELECT-Policy,
-- die Plattform-Admins (profiles.role = 'admin') Lesezugriff auf ALLE
-- provider_members gibt. Permissiv → wird mit bestehenden Policies ge-OR-t.

DROP POLICY IF EXISTS "Platform admins read provider_members" ON provider_members;
CREATE POLICY "Platform admins read provider_members" ON provider_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
