-- Migration 015: Brands-Spalte für bestehende Einträge befüllen
-- Befüllt die vorhandene brands-Spalte basierend auf der Kategorie.
-- Einträge die bereits brands haben werden NICHT überschrieben.
-- Ausführen in Supabase SQL-Editor

-- ============================================================
-- Motor Service / Repair — Motorenhersteller
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Volvo Penta', 'Yanmar', 'Mercury', 'Yamaha Marine',
    'Suzuki Marine', 'Honda Marine', 'Tohatsu', 'MAN', 'Mercruiser', 'ZF Marine'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'motor_service', 'motor service', 'repair', 'werkstatt', 'reparatur',
    'riparazione', 'réparation', 'reparación', 'officina'
  ]);

-- ============================================================
-- Marine Supplies / Zubehör — Ausrüstungsmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Harken', 'Lewmar', 'Ronstan', 'Wichard', 'Plastimo',
    'Musto', 'Helly Hansen', 'Henri Lloyd', 'Whale', 'Jabsco',
    'Vetus', 'Raymarine', 'Garmin', 'B&G', 'Rule'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'marine supplies', 'ship chandler', 'chandlery', 'zubehör',
    'accastillage', 'accessori nautici', 'accesorios náuticos', 'benodigdheden'
  ]);

-- ============================================================
-- Fuel / Tankstellen — Kraftstoffmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Shell', 'BP', 'Total', 'Esso', 'Q8', 'Aral', 'DKV'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'fuel', 'tankstelle', 'carburant', 'combustible', 'carburante', 'brandstof'
  ]);

-- ============================================================
-- Sailmaker / Segelmacher — Segelmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'North Sails', 'Elvstrøm Sails', 'Quantum Sails',
    'Doyle Sails', 'Ullman Sails', 'Hyde Sails', 'Dacron'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'sailmaker', 'segelmacher', 'voilerie', 'veleria', 'velería', 'zeilmakerij'
  ]);

-- ============================================================
-- Rigging / Takelage — Rigg-Marken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Selden', 'Furlex', 'Profurl', 'Facnor', 'Navtec',
    'Dyneema', 'Wichard', 'Tylaska', 'Harken', 'Lewmar'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'rigging', 'takelage', 'gréement', 'sartiame', 'aparejo', 'tuigage'
  ]);

-- ============================================================
-- Instruments / Elektronik — Navigationsmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Garmin', 'Raymarine', 'Simrad', 'B&G', 'Furuno',
    'Icom', 'Standard Horizon', 'Navionics', 'Vesper', 'Lowrance'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'instruments', 'marine electronics', 'elektronik', 'électronique marine',
    'elettronica marina', 'electrónica marina', 'elektronica', 'navigation'
  ]);

-- ============================================================
-- Yard / Werft / Bootsbau — Lackmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Hempel', 'International Paint', 'Jotun', 'Epifanes',
    'Awlgrip', 'Toplac', 'Blakes'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'yard', 'werft', 'bootsbau', 'chantier naval', 'cantiere navale',
    'astillero', 'scheepswerf', 'shipyard', 'boat builder'
  ]);

-- ============================================================
-- Painting / Antifouling — Lackmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Hempel', 'International Paint', 'Jotun', 'Epifanes',
    'Awlgrip', 'Blakes', 'Veneziani'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'painting', 'antifouling', 'lackierung', 'peinture', 'verniciatura', 'pintura'
  ]);

-- ============================================================
-- Surveyor / Gutachter — Klassifikationsgesellschaften
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'Lloyd''s Register', 'Bureau Veritas', 'DNV', 'RINA', 'Germanischer Lloyd'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'surveyor', 'gutachter', 'expert maritime', 'perito naval', 'ispettore'
  ]);

-- ============================================================
-- Crane / Kran — Kranmarken
-- ============================================================
UPDATE service_providers
SET brands = ARRAY[
    'TravelLift', 'Marine Travelift', 'Hiab', 'Palfinger', 'Roodberg'
]
WHERE (brands IS NULL OR array_length(brands, 1) IS NULL)
  AND category ILIKE ANY (ARRAY[
    'crane', 'kran', 'grue', 'grua', 'gru', 'travelift', 'travel lift'
  ]);

-- ============================================================
-- Verifikation: Wie viele Einträge haben jetzt Brands?
-- ============================================================
SELECT
    category,
    COUNT(*) AS total,
    COUNT(brands) AS with_brands,
    COUNT(*) - COUNT(brands) AS still_null
FROM service_providers
GROUP BY category
ORDER BY category;
