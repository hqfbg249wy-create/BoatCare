-- Migration 054: Bewertungs-Moderation
-- Fügt moderation_reason zur reviews-Tabelle hinzu und sichert Admin-Zugriff

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- Admins dürfen alle Reviews sehen (auch nicht genehmigte) und aktualisieren/löschen
DROP POLICY IF EXISTS "Admins can manage all reviews" ON reviews;
CREATE POLICY "Admins can manage all reviews" ON reviews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'admin_readonly')
    )
  );
