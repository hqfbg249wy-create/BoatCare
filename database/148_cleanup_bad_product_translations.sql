-- 148_cleanup_bad_product_translations.sql
-- Entfernt fehlerhafte Uebersetzungs-Cache-Eintraege, bei denen der uebersetzte
-- Name IDENTISCH zum Original ist (= Alt-Bug: untranslatiertes Ergebnis wurde
-- gecacht). Solche Eintraege werden geloescht, damit sie beim naechsten Aufruf
-- korrekt (via DeepL/Claude) neu uebersetzt werden. Korrekte Eintraege bleiben.

UPDATE public.metashop_products p
SET translations = NULLIF((
      SELECT jsonb_object_agg(k, v)
      FROM jsonb_each(p.translations) AS e(k, v)
      WHERE COALESCE(v->>'name', '') <> COALESCE(p.name, '')
    ), '{}'::jsonb)
WHERE p.translations IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_each(p.translations) AS e(k, v)
    WHERE COALESCE(v->>'name', '') = COALESCE(p.name, '')
  );

-- Analog fuer Betriebe: services-Uebersetzung identisch zum Original -> raus.
-- (service_providers.translations[lang] = { services, description, slogan })
-- Hier konservativ nur komplett leere/nutzlose Eintraege entfernen: wenn weder
-- description noch slogan noch services gesetzt sind.
UPDATE public.service_providers p
SET translations = NULLIF((
      SELECT jsonb_object_agg(k, v)
      FROM jsonb_each(p.translations) AS e(k, v)
      WHERE jsonb_typeof(v->'services') = 'array'
         OR COALESCE(v->>'description','') <> ''
         OR COALESCE(v->>'slogan','') <> ''
    ), '{}'::jsonb)
WHERE p.translations IS NOT NULL;
