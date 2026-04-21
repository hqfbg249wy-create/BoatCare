-- Drop old restrictive policies
DROP POLICY IF EXISTS "orders_buyer_delete" ON orders;
DROP POLICY IF EXISTS "order_items_buyer_delete" ON order_items;

-- Allow buyers to delete their own orders (cancelled or pending, any payment status)
CREATE POLICY "orders_buyer_delete" ON orders
  FOR DELETE USING (auth.uid() = buyer_id AND status IN ('cancelled', 'pending'));

-- Allow buyers to delete order items for their own deletable orders
CREATE POLICY "order_items_buyer_delete" ON order_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.buyer_id = auth.uid()
      AND orders.status IN ('cancelled', 'pending')
    )
  );

-- Allow buyers to update their own pending orders (for cancel action)
-- (keep existing if already created, DROP + CREATE to be safe)
DROP POLICY IF EXISTS "orders_buyer_update_cancel" ON orders;
CREATE POLICY "orders_buyer_update_cancel" ON orders
  FOR UPDATE USING (auth.uid() = buyer_id AND status = 'pending')
  WITH CHECK (auth.uid() = buyer_id AND status = 'cancelled');
