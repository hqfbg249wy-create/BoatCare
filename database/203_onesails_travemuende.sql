-- 203_onesails_travemuende.sql
-- "Travemuende" als Ortszusatz beim deutschen OneSails ergaenzen, damit die
-- Ortssuche "Travemuende" diesen Betrieb trifft.
--
-- Hintergrund: Der Betrieb (Gneversdorfer Weg 9, 23570) liegt in Luebeck-
-- Travemuende, war in den Daten aber nur als Stadt "Luebeck" gefuehrt.
-- "Luebeck-Travemuende" ist geografisch korrekt (Travemuende = Stadtteil von
-- Luebeck) und fliesst ueber den Trigger provider_search_text_upd automatisch
-- in search_text ein; beide Ortsnamen werden damit an der Wortgrenze gefunden.

UPDATE public.service_providers
SET city = 'Lübeck-Travemünde'
WHERE id = '7f15d262-2749-4979-a70a-c24a667b8b7c'
  AND city = 'Lübeck';

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 203: OneSails Deutschland -> Stadt "Lübeck-Travemünde" (Ortssuche Travemünde trifft jetzt).';
END $$;
