-- AUTOMATISCH GENERIERTE MIGRATION
-- Parsed Addresses für BoatCare ServiceProvider
-- Generiert mit parse_addresses.py

BEGIN;

-- ClipperVoiles 
UPDATE service_providers
SET
    street = 'Zone technique du port',
    postal_code = '34110',
    city = 'Frontignan',
    country = 'Deutschland'
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

-- VETUS B.V. (Headquarters)
UPDATE service_providers
SET
    street = 'Havenstraat 11',
    postal_code = '3115 HC',
    city = 'Schiedam',
    country = 'Niederlande'
WHERE id = 'cdbd49e4-c8b3-46d3-ad17-1838870f2a3e';

-- VETUS Service (Grou)
UPDATE service_providers
SET
    street = 'Singel 10B',
    postal_code = '9001 XP',
    city = 'Grou',
    country = 'Niederlande'
WHERE id = 'af0590da-0996-4a8b-b051-0dc83d497bb8';

-- SVB-Spezialversand für Yacht- und Bootszubehör GmbH
UPDATE service_providers
SET
    street = 'Gelsenkirchener Str. 25-27',
    postal_code = '28199',
    city = 'Bremen',
    country = 'Deutschland'
WHERE id = 'f4ba1e89-b08a-4599-a20f-8d61549f147c';

-- SVB-Spezialversand für Yacht- und Bootszubehör GmbH
UPDATE service_providers
SET
    street = 'Gelsenkirchener Str. 25-27',
    postal_code = '28199',
    city = 'Bremen',
    country = 'Deutschland'
WHERE id = 'a0ce5f04-43d0-4324-9946-f0ab6e4fee3f';

-- Osculati S.r.l.
UPDATE service_providers
SET
    street = 'Via Pacinotti 12',
    postal_code = '20054',
    city = 'Segrate (MI)',
    country = 'Italien'
WHERE id = '594ca499-fd1b-4c07-a52c-cb5bf103cf94';


COMMIT;

-- Validierung
SELECT
    COUNT(*) as total,
    COUNT(street) as has_street,
    COUNT(postal_code) as has_postal_code,
    COUNT(city) as has_city,
    COUNT(country) as has_country
FROM service_providers;

-- Zeige Ergebnis
SELECT id, name, street, postal_code, city, country
FROM service_providers
ORDER BY name
LIMIT 20;
