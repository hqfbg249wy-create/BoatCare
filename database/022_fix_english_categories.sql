-- ============================================
-- 022: Englische Kategorien auf Deutsch umstellen
-- Einmalig ausfuehren, um bestehende Eintraege zu korrigieren
-- ============================================

-- Vorher: Wie viele Eintraege haben englische Kategorien?
SELECT category, COUNT(*) as anzahl
FROM service_providers
WHERE category IN ('repair', 'motor_service', 'marine supplies', 'sailmaker',
                   'rigging', 'instruments', 'yard', 'surveyor', 'crane',
                   'painting', 'heating_climate', 'marina')
GROUP BY category
ORDER BY anzahl DESC;

-- Kategorien auf Deutsch umstellen
UPDATE service_providers SET category = 'Werkstatt'      WHERE category = 'repair';
UPDATE service_providers SET category = 'Motorservice'   WHERE category = 'motor_service';
UPDATE service_providers SET category = 'Zubehör'        WHERE category = 'marine supplies';
UPDATE service_providers SET category = 'Segelmacher'    WHERE category = 'sailmaker';
UPDATE service_providers SET category = 'Rigg'           WHERE category = 'rigging';
UPDATE service_providers SET category = 'Instrumente'    WHERE category = 'instruments';
UPDATE service_providers SET category = 'Bootsbauer'     WHERE category = 'yard';
UPDATE service_providers SET category = 'Gutachter'      WHERE category = 'surveyor';
UPDATE service_providers SET category = 'Kran'           WHERE category = 'crane';
UPDATE service_providers SET category = 'Lackiererei'    WHERE category = 'painting';
UPDATE service_providers SET category = 'Heizung/Klima'  WHERE category = 'heating_climate';
UPDATE service_providers SET category = 'Marina'         WHERE category = 'marina';

-- Nachher: Alle Kategorien pruefen
SELECT category, COUNT(*) as anzahl
FROM service_providers
GROUP BY category
ORDER BY anzahl DESC;
