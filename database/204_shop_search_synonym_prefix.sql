-- 204_shop_search_synonym_prefix.sql
-- Deutlich bessere Treffsicherheit der SHOP-Suche (Produkte).
--
-- Problem (Bsp. "hose"):
--   * Lange Hosen heissen im Katalog "PANTALONE" (it.) bzw. "CARGO PANT"
--     (Singular). Die Synonymgruppe hatte nur "pants"/"shorts"/"bermuda", und
--     Synonyme wurden nur als GANZES WORT gematcht -> "pants" != "pant",
--     "pants" != "pantalone". Ergebnis: nur Shorts/Bermuda, keine langen Hosen.
--
-- Fix:
--   (A) Synonyme matchen jetzt als WORT-PRAEFIX (\yterm statt \yterm\y):
--       fuer das Original-Suchwort bleibt es bei Wortgrenze (Anfang/Ende).
--       Damit greifen Singular/Plural/Beugung: "pant" -> pant, pants,
--       pantalone, pantaloni; "short" -> short, shorts.
--   (B) Mehrsprachige Katalog-Begriffe in die Kleidungs-/Ausruestungsgruppen
--       (italienisch/franz./span./niederl.), weil der Lieferant italienische
--       Produktnamen nutzt (PANTALONE, GIACCA, CAMICIA, STIVALI, GUANTI,
--       GIUBBOTTO ...).
--   Nur die PRODUKTSUCHE wird geaendert; die Anbietersuche (202) bleibt.

-- ─────────────────────────────────────────────────────────────────────────
-- (B) Synonymgruppen mit Katalog-Vokabular (Stämme fuer Praefix-Matching).
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.search_synonyms SET terms =
  ARRAY['kleidung','bekleidung','funktionskleidung','segelbekleidung','clothing','apparel','textilien','abbiglia','vetement','ropa','kleding']
  WHERE 'kleidung' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['jacke','jacken','jacket','segeljacke','weste','westen','giacc','veste','chaqueta']
  WHERE 'jacke' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['hose','hosen','segelhose','pant','pantalon','trouser','short','bermuda','broek']
  WHERE 'hose' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['shirt','tshirt','oberteil','camic','camisa','chemise','hemd','maglietta']
  WHERE 'shirt' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['pullover','pulli','sweater','sweatshirt','hoodie','fleece','felpa','maglione']
  WHERE 'pullover' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['schuh','shoe','stiefel','segelschuh','deckschuh','scarp','stival','chaussure','calzatura']
  WHERE 'schuh' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['muetze','mutze','beanie','kappe','schirmmuetze','cappello','berretto','bonnet']
  WHERE 'muetze' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['handschuh','glove','segelhandschuh','guant','gant','guante']
  WHERE 'handschuh' = ANY(terms);

UPDATE public.search_synonyms SET terms =
  ARRAY['schwimmweste','rettungsweste','lifejacket','auftriebshilfe','giubbotto','salvagente','gilet']
  WHERE 'schwimmweste' = ANY(terms);

-- ─────────────────────────────────────────────────────────────────────────
-- (A) search_products: Synonyme als Wort-PRAEFIX.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_products(
  q text,
  p_category uuid DEFAULT NULL,
  p_provider uuid DEFAULT NULL,
  p_limit int DEFAULT 40,
  p_offset int DEFAULT 0
) RETURNS SETOF public.metashop_products
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_q         text := extensions.unaccent(lower(coalesce(q, '')));
  v_tokens    text[];
  tok         text;
  grp         text[];
  term        text;
  cond        text;
  strong      text;
  parts       text[] := '{}';
  score_terms text[] := '{}';
  v_where     text;
  v_score     text;
  v_sql       text;
BEGIN
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.45', true);

  SELECT array_agg(t) INTO v_tokens FROM (
    SELECT t FROM regexp_split_to_table(v_q, '[^[:alnum:]]+') AS t
    WHERE length(t) >= 2
    LIMIT 6
  ) s;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN QUERY
      SELECT p.* FROM public.metashop_products p
      WHERE p.is_active
        AND (p_category IS NULL OR p.category_id = p_category)
        AND (p_provider IS NULL OR p.provider_id = p_provider)
      ORDER BY p.created_at DESC, p.id
      LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  FOREACH tok IN ARRAY v_tokens LOOP
    SELECT array_agg(DISTINCT x) INTO grp FROM (
      SELECT unnest(s.terms) AS x FROM public.search_synonyms s WHERE tok = ANY(s.terms)
    ) g;

    -- Starker Treffer: Originalwort an Wortgrenze (Anfang/Ende)
    -- + Synonyme als Wort-PRAEFIX (faengt Singular/Plural/Beugung/Sprachform).
    strong := format('b.search_text ~ %L', '(\y' || tok || '|' || tok || '\y)');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          strong := strong || format(' OR b.search_text ~ %L', '\y' || term);
        END IF;
      END LOOP;
    END IF;

    -- Kandidaten/Recall: Teilstring + Synonyme (Praefix) + Tippfehler.
    cond := format('b.search_text LIKE %L', '%' || tok || '%');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          cond := cond || format(' OR b.search_text ~ %L', '\y' || term);
        END IF;
      END LOOP;
    END IF;
    IF length(tok) >= 3 THEN
      cond := cond || format(' OR (%L <%% b.search_text)', tok);
    END IF;

    parts := parts || ('(' || cond || ')');
    score_terms := score_terms || format('(CASE WHEN (%s) THEN 1 ELSE 0 END)', strong);
  END LOOP;

  v_where := array_to_string(parts, ' AND ');
  v_score := array_to_string(score_terms, ' + ');

  v_sql := format($f$
    WITH m AS (
      SELECT b AS rec,
             b.name       AS _name,
             b.created_at AS _created,
             b.id         AS _id,
             (%s)         AS _score
      FROM public.metashop_products b
      WHERE b.is_active
        AND (%L::uuid IS NULL OR b.category_id = %L::uuid)
        AND (%L::uuid IS NULL OR b.provider_id = %L::uuid)
        AND ( %s )
    ),
    r AS (
      SELECT m.*, max(m._score) OVER () AS _maxscore FROM m
    )
    SELECT (r.rec).*
    FROM r
    WHERE r._score > 0 OR r._maxscore = 0
    ORDER BY
      r._score DESC,
      (extensions.unaccent(lower(coalesce(r._name,''))) = %L) DESC,
      (extensions.unaccent(lower(coalesce(r._name,''))) LIKE %L) DESC,
      extensions.similarity(coalesce(r._name,''), %L) DESC,
      r._created DESC, r._id
    LIMIT %s OFFSET %s
  $f$,
    v_score,
    p_category, p_category, p_provider, p_provider,
    v_where,
    v_q, v_q || '%', v_q,
    p_limit, p_offset
  );

  RETURN QUERY EXECUTE v_sql;
END $$;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 204: Shop-Suche Synonyme als Wort-Praefix + mehrsprachige Katalog-Begriffe (hose->pantalone/pant usw.).';
END $$;
