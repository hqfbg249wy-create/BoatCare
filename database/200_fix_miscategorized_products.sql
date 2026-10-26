-- 200_fix_miscategorized_products.sql
-- Bereinigung offensichtlich falsch kategorisierter Produkte.
--
-- Befund: In der Kategorie "Bekleidung" (8db10d81-89bb-4bc9-9513-ec744be14cec,
-- Anbieter Leghorn Yacht Chandler) lagen Artikel, die klar keine Bekleidung
-- sind (Werkzeug, Helm, Rettungsweste, Stiefel). Dadurch tauchten sie u.a. bei
-- der Suche "kleidung" auf.
--
-- Hinweis: search_text wird vom Trigger metashop_search_text_upd bei Aenderung
-- von category_id automatisch neu gebaut -> die alten Kategorie-Begriffe
-- ("bekleidung" etc.) verschwinden nach dem UPDATE von selbst.
--
-- Jeder Treffer ist per fester Produkt-ID adressiert (kein Namens-Pattern),
-- damit nichts versehentlich mitgezogen wird.

-- → Werkzeuge
UPDATE public.metashop_products SET category_id = '79d67213-cc10-4abd-a332-7b17c7d0559c'
WHERE id IN (
  '8273e5ef-b8e6-4565-8d8c-f27dd7400fbc',  -- 36.0171.04 - BIT KIT LEATHERMAN
  '9fa39d83-1170-4812-a407-b45060dcc62f'   -- 36.0393.01 - CUSTODIE LEATHERMAN CUOIO (Werkzeug-Etui)
);

-- → Rettungswesten
UPDATE public.metashop_products SET category_id = 'a0aeb035-ade8-4aa4-b8f2-bf07eeac9f27'
WHERE id IN (
  'cb99eff2-368b-4f96-842c-93f18ac76bc9',  -- 07.0004.01 GIUBBOTTO A STOLA SOLAS (Rettungsweste)
  'dc6c2043-0ddf-4886-a6dd-fa5f653d510d'   -- FORP66805 PILOT 165N AUT. (165N Automatik-Rettungsweste)
);

-- → Schuhe
UPDATE public.metashop_products SET category_id = 'b3286a9a-e3d2-4714-bb50-04db433d0079'
WHERE id IN (
  '8ddfebf9-67d8-4524-9598-a39f4d595076',  -- 36.0233.42 STIVALI ALTI SAILOR EVOLUTION tg 42
  'f68a7808-2150-4b8c-86c4-40bccc41aa7b',  -- 36.0233.43 STIVALI ALTI SAILOR EVOLUTION 43
  'e9338090-81fb-4f10-a1c0-c518bee56721'   -- DG917BLK SHORT CRUISIN BOOT size42
);

-- → Sicherheit & Rettung
UPDATE public.metashop_products SET category_id = '07fbcc4c-142e-4bde-86de-e718de048197'
WHERE id IN (
  'd1bfc3ea-2ffd-4fee-8f35-e56a31d308cd'   -- PETZLA010AA03 PETZL VERTEX CASCO (Schutzhelm)
);

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 200: 8 falsch als Bekleidung getaggte Produkte in Werkzeuge/Rettungswesten/Schuhe/Sicherheit umgehaengt (search_text via Trigger neu gebaut).';
END $$;
