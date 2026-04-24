-- MIGRATION: Adressdaten intelligent aufteilen
-- Analysiert die vorhandenen Adressen in 'street' und versucht sie aufzuteilen

-- ========================================
-- TEIL 1: AKTUELLE SITUATION ANALYSIEREN
-- ========================================

-- Zeige alle Adressen, die aufgeteilt werden müssen
SELECT
    id,
    name,
    street as vollstaendige_adresse,
    postal_code,
    city,
    country
FROM service_providers
WHERE street IS NOT NULL
ORDER BY name
LIMIT 20;

-- ========================================
-- TEIL 2: MANUELLE AUFTEILUNG
-- ========================================

-- ⚠️ WICHTIGER HINWEIS:
-- Die Adressen in deiner Datenbank sind sehr unterschiedlich formatiert.
-- Ein automatisches Parsing ist komplex und fehleranfällig.
--
-- EMPFEHLUNG: Verwende das Admin-Panel, um die Adressen manuell zu korrigieren:
-- 1. Öffne das Admin-Panel
-- 2. Gehe zu "ServiceProvider"
-- 3. Bearbeite jeden Provider einzeln
-- 4. Trage die Adressdaten in die korrekten Felder ein:
--    - street: "Bavariastraße 1"
--    - postal_code: "97232"
--    - city: "Giebelstadt"
--    - country: "Deutschland"

-- ========================================
-- TEIL 3: BEISPIEL-UPDATES (zum manuellen Anpassen)
-- ========================================

-- Hier sind Beispiele, wie du einzelne Provider korrigieren kannst:

-- ClipperVoiles
UPDATE service_providers
SET
    street = 'Zone technique du port',
    postal_code = '34110',
    city = 'Frontignan',
    country = 'Frankreich'
WHERE id = '93bfe1ad-5ebd-4e0b-a0ce-7aae67fd2bc5';

-- Bavaria Yachtbau GmbH
UPDATE service_providers
SET
    street = 'Bavariastraße 1',
    postal_code = '97232',
    city = 'Giebelstadt',
    country = 'Deutschland'
WHERE id = 'cf05851c-b292-4e85-b99a-4cc5151dd8ed';

-- HanseYachts AG
UPDATE service_providers
SET
    street = 'Ladebower Chaussee 11',
    postal_code = '17493',
    city = 'Greifswald',
    country = 'Deutschland'
WHERE id = '0a21b94b-df0a-4019-9000-fadca8873684';

-- Royal Huisman Shipyard B.V.
UPDATE service_providers
SET
    street = 'Flevoweg 1',
    postal_code = '8325 PA',
    city = 'Vollenhove',
    country = 'Niederlande'
WHERE id = '08617609-d2e9-4b42-ba82-5f6fc91ef313';

-- Sunreef Yachts Shipyard
UPDATE service_providers
SET
    street = 'ul. Tarcice 6',
    postal_code = '80-718',
    city = 'Gdańsk',
    country = 'Polen'
WHERE id = '75bdf455-0db6-4ff8-9ac8-d0b7a5784b9f';

-- ========================================
-- TEIL 4: AUTOMATISCHES PARSING (EXPERIMENTAL)
-- ========================================

-- Versuche, Deutschland als Land zu setzen, wenn es im street-Feld steht
UPDATE service_providers
SET country = 'Deutschland'
WHERE street LIKE '%Deutschland%'
  AND country IS NULL;

-- Versuche, Frankreich als Land zu setzen
UPDATE service_providers
SET country = 'Frankreich'
WHERE street LIKE '%France%' OR street LIKE '%Frankreich%'
  AND country IS NULL;

-- Entferne ", Deutschland" am Ende von street (falls vorhanden)
UPDATE service_providers
SET street = TRIM(REPLACE(street, ', Deutschland', ''))
WHERE street LIKE '%, Deutschland';

-- Entferne ", Frankreich" am Ende von street (falls vorhanden)
UPDATE service_providers
SET street = TRIM(REPLACE(street, ', Frankreich', ''))
WHERE street LIKE '%, Frankreich';

-- ========================================
-- TEIL 5: ERGEBNIS PRÜFEN
-- ========================================

SELECT
    id,
    name,
    street,
    postal_code,
    city,
    country
FROM service_providers
ORDER BY name
LIMIT 20;

-- Zähle, wie viele Provider vollständige Adressen haben
SELECT
    COUNT(*) as total,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country,
    COUNT(CASE WHEN street IS NOT NULL AND postal_code IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL THEN 1 END) as vollstaendig
FROM service_providers;
