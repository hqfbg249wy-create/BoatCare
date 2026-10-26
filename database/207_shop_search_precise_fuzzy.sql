-- 207_shop_search_precise_fuzzy.sql
-- Praezisere Tippfehler-Toleranz der SHOP-Suche (Produkte).
--
-- Problem (Bsp. "brille"): Es gibt keine Brille im Katalog, trotzdem erschien
-- der CIF-Reiniger "VETRI BRILLANTI". Ursache: die bisherige Fuzzy-Bedingung
-- nutzte word_similarity (<%), die "brille" als Teilwort in "brillanti" mit
-- 0.71 als aehnlich einstufte. So zeigte der Fuzzy-Fallback (wenn es sonst
-- keinen Treffer gibt) semantisch falsche Produkte.
--
-- Fix: Tippfehler-Toleranz jetzt WORT-GENAU statt teilwort-basiert:
--   ein Wort w im search_text gilt nur dann als Tippfehler-Treffer, wenn
--     * similarity(tok, w) >= 0.5  (Ganzwort-Trigramm-Aehnlichkeit) UND
--     * abs(length(w) - length(tok)) <= 2  (aehnliche Laenge).
--   Damit:
--     * "brille"/"brillanti": similarity 0.42, Laengendiff 3 -> KEIN Treffer.
--     * echte Tippfehler bleiben: "reinigr"->reiniger, "antifoling"->antifouling.
--   Strong-Treffer (Wortgrenze + Synonym-Praefix) und Ranking bleiben wie in 204.
--   Nur die Anbietersuche (202) ist nicht betroffen.

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

    -- Starker Treffer: Originalwort an Wortgrenze (Anfang/Ende) + Synonyme als Praefix.
    strong := format('b.search_text ~ %L', '(\y' || tok || '|' || tok || '\y)');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          strong := strong || format(' OR b.search_text ~ %L', '\y' || term);
        END IF;
      END LOOP;
    END IF;

    -- Kandidaten/Recall: Teilstring + Synonyme (Praefix) + WORT-GENAUE
    -- Tippfehler-Toleranz (aehnliche Laenge + Ganzwort-Aehnlichkeit).
    cond := format('b.search_text LIKE %L', '%' || tok || '%');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          cond := cond || format(' OR b.search_text ~ %L', '\y' || term);
        END IF;
      END LOOP;
    END IF;
    IF length(tok) >= 4 THEN
      cond := cond || format(
        ' OR EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(b.search_text, %L)) AS w'
        || ' WHERE length(w) >= 3 AND abs(length(w) - %s) <= 2'
        || ' AND extensions.similarity(%L, w) >= 0.5)',
        '[^[:alnum:]]+', length(tok)::text, tok);
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
  RAISE NOTICE '✅ Migration 207: Shop-Tippfehler-Toleranz wortgenau (Laenge + Ganzwort-Aehnlichkeit) -> "brille" matcht nicht mehr "brillanti".';
END $$;
