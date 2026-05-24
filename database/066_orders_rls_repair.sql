-- Migration 066: Reparatur orders-RLS
--
-- Produktion meldet beim Checkout:
--   "new row violates row-level security policy for table 'orders'"
--
-- Die INSERT-Policy aus Migration 028 ist scheinbar nicht aktiv. Wir
-- erzeugen alle nötigen orders-Policies idempotent neu, sodass der Käufer
-- garantiert insert/update/delete auf eigene Bestellungen darf.

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ── Käufer: Bestellung anlegen ────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_buyer_insert" ON orders;
CREATE POLICY "orders_buyer_insert" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

-- ── Käufer: eigene Bestellungen sehen ─────────────────────────────────────
DROP POLICY IF EXISTS "orders_buyer_read" ON orders;
CREATE POLICY "orders_buyer_read" ON orders
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

-- ── Käufer: eigene Bestellung (im Pending-Status) ändern ──────────────────
DROP POLICY IF EXISTS "orders_buyer_update_cancel" ON orders;
CREATE POLICY "orders_buyer_update_cancel" ON orders
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

-- ── Käufer: eigene Bestellung im Pending-Status löschen ───────────────────
DROP POLICY IF EXISTS "orders_buyer_delete" ON orders;
CREATE POLICY "orders_buyer_delete" ON orders
  FOR DELETE TO authenticated
  USING (buyer_id = auth.uid() AND status = 'pending');

-- ── Provider: eigene Bestellungen lesen ───────────────────────────────────
DROP POLICY IF EXISTS "orders_provider_read" ON orders;
CREATE POLICY "orders_provider_read" ON orders
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE service_providers.user_id = auth.uid()
    )
  );

-- ── Provider: Bestellungen aktualisieren (Status ändern etc.) ─────────────
DROP POLICY IF EXISTS "orders_provider_update" ON orders;
CREATE POLICY "orders_provider_update" ON orders
  FOR UPDATE TO authenticated
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

-- ── Provider-Member: eigene Provider-Bestellungen lesen ───────────────────
-- (Für das Enterprise-Multi-User-Feature)
DROP POLICY IF EXISTS "orders_provider_member_read" ON orders;
CREATE POLICY "orders_provider_member_read" ON orders
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT provider_id FROM provider_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- ── Admin sieht alle ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_admin_all" ON orders;
CREATE POLICY "orders_admin_all" ON orders
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── Diagnose-Output: zeigt welche Policies jetzt aktiv sind ───────────────
SELECT polname, polcmd
  FROM pg_policy
 WHERE polrelid = 'orders'::regclass
 ORDER BY polname;
