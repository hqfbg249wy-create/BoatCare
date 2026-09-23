-- 150_market_insights_total_users.sql
-- Marktanalyse: anonyme Nutzerzahl (total_users) ergaenzen.
-- Das Provider-Portal zeigt Verteilungen unter 1000 Nutzern nur prozentual;
-- absolute Zahlen erst ab 1000 Nutzern. Dafuer braucht das Frontend die
-- (anonyme, aggregierte) Gesamtzahl der Nutzer als Schwellwert.
--
-- total_users wird ans Ende der bestehenden fleet_overview_stats-View
-- angehaengt (CREATE OR REPLACE VIEW erlaubt Spalten NUR am Ende zu ergaenzen)
-- und fliesst automatisch durch get_market_insights() (row_to_json).

CREATE OR REPLACE VIEW fleet_overview_stats AS
SELECT
  (SELECT COUNT(*) FROM boats) AS total_boats,
  (SELECT COUNT(DISTINCT boat_type) FROM boats WHERE boat_type IS NOT NULL AND TRIM(boat_type) != '') AS unique_boat_types,
  (SELECT COUNT(DISTINCT manufacturer) FROM boats WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '') AS unique_boat_manufacturers,
  (SELECT COUNT(*) FROM equipment) AS total_equipment,
  (SELECT COUNT(DISTINCT category) FROM equipment WHERE category IS NOT NULL AND TRIM(category) != '') AS unique_equipment_categories,
  (SELECT COUNT(DISTINCT manufacturer) FROM equipment WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '') AS unique_equipment_manufacturers,
  (SELECT COUNT(*) FROM profiles) AS total_users
WHERE public.provider_can_analytics();

-- Grants bleiben durch CREATE OR REPLACE erhalten; sicherheitshalber erneut.
REVOKE ALL ON fleet_overview_stats FROM anon;
GRANT SELECT ON fleet_overview_stats TO authenticated;
