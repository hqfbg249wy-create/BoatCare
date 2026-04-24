-- Migration 012: Sonderangebote und Shop-URL
-- current_promotion  = Freitext für aktuelles Sonderangebot (z.B. "10% Rabatt auf alle Antifouling-Arbeiten bis Ende April")
-- promotion_valid_until = Ablaufdatum des Angebots (NULL = kein Ablaufdatum)
-- shop_url = Link zum externen Online-Shop des Betriebs

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS current_promotion  TEXT,
  ADD COLUMN IF NOT EXISTS promotion_valid_until DATE,
  ADD COLUMN IF NOT EXISTS shop_url           TEXT;

-- Index damit wir schnell alle Betriebe mit aktiver Promotion laden können
CREATE INDEX IF NOT EXISTS idx_providers_promotion
  ON service_providers (current_promotion)
  WHERE current_promotion IS NOT NULL;

-- Verifizierung
SELECT
  id,
  name,
  current_promotion,
  promotion_valid_until,
  shop_url
FROM service_providers
WHERE current_promotion IS NOT NULL
LIMIT 5;
