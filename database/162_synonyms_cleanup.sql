-- 162_synonyms_cleanup.sql
-- Praezision: Synonyme, die als GANZE deutsche Woerter mit fachfremder
-- Bedeutung kollidieren, entfernen. Beispiele:
--   'fall'  -> "Fall/Grund" (matchte Cristec-Trenntrafo-Beschreibung)
--   'hat'   -> Verb "hat"
--   'boots' -> Genitiv "des Boots"
-- Katalog kuratiert neu setzen (datengetrieben, jederzeit erweiterbar).

DELETE FROM public.search_synonyms;

INSERT INTO public.search_synonyms (terms) VALUES
  (ARRAY['kleidung','bekleidung','funktionskleidung','segelbekleidung','clothing','apparel','textilien']),
  (ARRAY['jacke','jacken','jacket','segeljacke','weste','westen']),
  (ARRAY['hose','hosen','segelhose','pants','trousers','shorts','bermuda']),
  (ARRAY['polo','polos','poloshirt','poloshirts']),
  (ARRAY['shirt','shirts','tshirt','tshirts','oberteil']),
  (ARRAY['pullover','pulli','sweater','sweatshirt','hoodie','fleece']),
  (ARRAY['schuh','schuhe','shoes','stiefel','segelschuhe','deckschuhe']),
  (ARRAY['muetze','mutze','beanie','kappe','schirmmuetze']),
  (ARRAY['handschuh','handschuhe','gloves','segelhandschuhe']),
  (ARRAY['regenjacke','oelzeug','olzeug','oilskin','regenkleidung','regenhose','friesennerz']),
  (ARRAY['schwimmweste','rettungsweste','lifejacket','auftriebshilfe']),
  (ARRAY['tau','tauwerk','leine','leinen','rope','ropes','schot','schoten','festmacher','grossschot','fockschot']),
  (ARRAY['anker','ankerkette','anchor','ankerleine']),
  (ARRAY['fender','fenders','abweiser']),
  (ARRAY['batterie','batterien','akku','akkus','battery','batteries']),
  (ARRAY['motor','motoren','engine','engines','antrieb']),
  (ARRAY['reinigung','reiniger','cleaner','cleaners','pflege','bootspflege']);
