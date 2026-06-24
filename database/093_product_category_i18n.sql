-- 093 — Produkt-Kategorien mehrsprachig (EN/FR/IT/ES/NL)
-- Fügt name_<lang>-Spalten zu product_categories hinzu und befüllt sie
-- handübersetzt. Frontend liest name_<aktive-sprache> mit Fallback auf name_de.
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE per name_de.

ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_fr text;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_it text;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_es text;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_nl text;

-- Helper: pro Kategorie ein UPDATE, gematcht über den deutschen Namen.
-- Deckt sowohl Umlaut- (ä/ü) als auch ae/ue-Schreibweisen ab.

UPDATE product_categories SET name_en='Engine & Drive',        name_fr='Moteur & propulsion',             name_it='Motore & propulsione',        name_es='Motor & propulsión',           name_nl='Motor & aandrijving'        WHERE name_de='Motor & Antrieb';
UPDATE product_categories SET name_en='Electrics & Onboard Power', name_fr='Électricité & circuit de bord', name_it='Elettrica & impianto di bordo', name_es='Electricidad & red de a bordo', name_nl='Elektra & boordnet'         WHERE name_de='Elektrik & Bordnetz';
UPDATE product_categories SET name_en='Electrics & Battery',    name_fr='Électricité & batterie',          name_it='Elettrica & batteria',        name_es='Electricidad & batería',       name_nl='Elektra & accu'             WHERE name_de='Elektrik & Batterie';
UPDATE product_categories SET name_en='Electrics & Electronics',name_fr='Électricité & électronique',      name_it='Elettrica & elettronica',     name_es='Electricidad & electrónica',   name_nl='Elektra & elektronica'      WHERE name_de='Elektrik & Elektronik';
UPDATE product_categories SET name_en='Navigation & Electronics',name_fr='Navigation & électronique',      name_it='Navigazione & elettronica',   name_es='Navegación & electrónica',     name_nl='Navigatie & elektronica'    WHERE name_de='Navigation & Elektronik';
UPDATE product_categories SET name_en='Anchor & Mooring',       name_fr='Ancre & amarrage',                name_it='Ancora & ormeggio',           name_es='Ancla & amarre',               name_nl='Anker & afmeren'            WHERE name_de='Anker & Vertäuung';
UPDATE product_categories SET name_en='Anchor & Chain',         name_fr='Ancre & chaîne',                  name_it='Ancora & catena',             name_es='Ancla & cadena',               name_nl='Anker & ketting'            WHERE name_de='Anker & Kette';
UPDATE product_categories SET name_en='Rigging & Deck Hardware',name_fr='Gréement & accastillage de pont', name_it='Attrezzatura & accessori di coperta', name_es='Aparejo & herrajes de cubierta', name_nl='Tuigage & dekbeslag'   WHERE name_de='Rigg & Decksbeschläge';
UPDATE product_categories SET name_en='Sails & Rigging',        name_fr='Voiles & gréement',               name_it='Vele & attrezzatura',         name_es='Velas & aparejo',              name_nl='Zeilen & tuigage'           WHERE name_de='Segel & Rigg';
UPDATE product_categories SET name_en='Sails & Canvas',         name_fr='Voiles & toile',                  name_it='Vele & tessuti',              name_es='Velas & lona',                 name_nl='Zeilen & doek'              WHERE name_de='Segel & Tuch';
UPDATE product_categories SET name_en='Safety & Rescue',        name_fr='Sécurité & sauvetage',            name_it='Sicurezza & salvataggio',     name_es='Seguridad & rescate',          name_nl='Veiligheid & redding'       WHERE name_de='Sicherheit & Rettung';
UPDATE product_categories SET name_en='Safety',                 name_fr='Sécurité',                        name_it='Sicurezza',                   name_es='Seguridad',                    name_nl='Veiligheid'                 WHERE name_de='Sicherheit';
UPDATE product_categories SET name_en='Care & Antifouling',     name_fr='Entretien & antifouling',         name_it='Cura & antivegetativa',       name_es='Cuidado & antiincrustante',    name_nl='Onderhoud & antifouling'    WHERE name_de='Pflege & Antifouling';
UPDATE product_categories SET name_en='Care & Cleaning',        name_fr='Entretien & nettoyage',           name_it='Cura & pulizia',              name_es='Cuidado & limpieza',           name_nl='Onderhoud & reiniging'      WHERE name_de IN ('Pflege & Reinigung','Pflege & Reinigung ');
UPDATE product_categories SET name_en='Antifouling & Paints',   name_fr='Antifouling & peintures',         name_it='Antivegetativa & vernici',    name_es='Antiincrustante & pinturas',   name_nl='Antifouling & verf'         WHERE name_de='Antifouling & Farben';
UPDATE product_categories SET name_en='Interior & Comfort',     name_fr='Aménagement intérieur & confort', name_it='Allestimento interni & comfort', name_es='Interior & confort',        name_nl='Interieur & comfort'        WHERE name_de='Innenausbau & Komfort';
UPDATE product_categories SET name_en='Sanitary & Comfort',     name_fr='Sanitaire & confort',             name_it='Sanitari & comfort',          name_es='Sanitario & confort',          name_nl='Sanitair & comfort'         WHERE name_de IN ('Sanitär & Komfort','Sanitaer & Komfort');
UPDATE product_categories SET name_en='Deck & Fittings',        name_fr='Pont & accastillage',             name_it='Coperta & accessori',         name_es='Cubierta & herrajes',          name_nl='Dek & beslag'               WHERE name_de IN ('Deck & Beschläge','Deck & Beschlaege');
UPDATE product_categories SET name_en='Clothing',               name_fr='Vêtements',                       name_it='Abbigliamento',               name_es='Ropa',                         name_nl='Kleding'                    WHERE name_de='Bekleidung';
UPDATE product_categories SET name_en='Clothing & Gear',        name_fr='Vêtements & équipement',          name_it='Abbigliamento & attrezzatura',name_es='Ropa & equipo',                name_nl='Kleding & uitrusting'       WHERE name_de IN ('Bekleidung & Ausrüstung','Bekleidung & Ausruestung');
UPDATE product_categories SET name_en='Dinghy & Watersports',   name_fr='Annexe & sports nautiques',       name_it='Tender & sport acquatici',    name_es='Anexo & deportes acuáticos',   name_nl='Bijboot & watersport'       WHERE name_de='Dinghy & Wassersport';
UPDATE product_categories SET name_en='Trailer & Transport',    name_fr='Remorque & transport',            name_it='Rimorchio & trasporto',       name_es='Remolque & transporte',        name_nl='Trailer & transport'        WHERE name_de='Trailer & Transport';
UPDATE product_categories SET name_en='Communication',          name_fr='Communication',                   name_it='Comunicazione',               name_es='Comunicación',                 name_nl='Communicatie'               WHERE name_de='Kommunikation';
UPDATE product_categories SET name_en='Hull & Underwater',      name_fr='Coque & carène',                  name_it='Scafo & opera viva',          name_es='Casco & obra viva',            name_nl='Romp & onderwaterschip'     WHERE name_de='Rumpf & Unterwasser';
UPDATE product_categories SET name_en='Books, Charts & Gifts',  name_fr='Livres, cartes & cadeaux',        name_it='Libri, carte & regali',       name_es='Libros, cartas & regalos',     name_nl='Boeken, kaarten & cadeaus'  WHERE name_de IN ('Bücher, Karten & Geschenke','Buecher, Karten & Geschenke');
UPDATE product_categories SET name_en='Other',                  name_fr='Autres',                          name_it='Altro',                       name_es='Otros',                        name_nl='Overig'                     WHERE name_de='Sonstiges';

-- Kontroll-Query: welche Kategorien sind noch unübersetzt?
-- SELECT name_de FROM product_categories WHERE name_en IS NULL ORDER BY name_de;
