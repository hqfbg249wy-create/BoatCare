-- 127_equipment_quantity.sql
-- Ausruestung bekommt ein Mengenfeld (Stueckzahl). Bisher war jedes Teil ein
-- Einzeleintrag ohne Anzahl. Fuer den Kunden-Import einer Provider-Excel
-- (gekaufte Produkte) und Nachbestellungen soll "Bestand ergaenzen" die
-- Stueckzahl eines vorhandenen Teils erhoehen koennen.
--
-- Default 1 (jedes bestehende Teil = 1 Stueck). NOT NULL, damit die App immer
-- einen Wert hat.

BEGIN;

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Sicherheitshalber vorhandene NULLs (falls Spalte schon ohne Default existierte)
UPDATE equipment SET quantity = 1 WHERE quantity IS NULL;

-- Menge muss >= 1 sein.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_quantity_positive'
  ) THEN
    ALTER TABLE equipment
      ADD CONSTRAINT equipment_quantity_positive CHECK (quantity >= 1);
  END IF;
END $$;

COMMIT;
