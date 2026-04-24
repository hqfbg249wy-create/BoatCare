-- Normalisiert alle Kategorien auf die definierten Kategorien
-- Führen Sie dieses SQL direkt in der Supabase SQL-Konsole aus

-- Zeige aktuelle Kategorien
SELECT category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY count DESC;

-- Normalisiere Kategorien
UPDATE service_providers SET category = 'Zubehör' WHERE category IN ('supplies', 'boat supplies', 'Versorgung');
UPDATE service_providers SET category = 'Werkstatt' WHERE category = 'repair';
UPDATE service_providers SET category = 'Marina' WHERE category = 'marina';
UPDATE service_providers SET category = 'Segelmacher' WHERE category = 'sailmaker';
UPDATE service_providers SET category = 'Rigg' WHERE category IN ('rigging', 'Tauwerk');
UPDATE service_providers SET category = 'Instrumente' WHERE category = 'Elektronik';

-- Zeige finale Kategorien
SELECT category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY count DESC;
