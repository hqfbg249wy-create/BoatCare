-- 136_sail_area.sql
-- Segelflaeche im Messblatt: Gesamtflaeche + Einheit (m2 oder Quadratfuss).
-- In anderen Laendern wird die Segelflaeche in square feet angegeben, daher
-- Wert + Einheit getrennt speichern.

ALTER TABLE public.sail_measurements
  ADD COLUMN IF NOT EXISTS area      numeric(10,2),
  ADD COLUMN IF NOT EXISTS area_unit text NOT NULL DEFAULT 'm2';

COMMENT ON COLUMN public.sail_measurements.area IS
  'Segelflaeche (Gesamt) in der Einheit area_unit.';
COMMENT ON COLUMN public.sail_measurements.area_unit IS
  'Einheit der Segelflaeche: ''m2'' (Quadratmeter) oder ''sqft'' (Quadratfuss).';
