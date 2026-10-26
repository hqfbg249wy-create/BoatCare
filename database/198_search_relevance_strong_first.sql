-- 198_search_relevance_strong_first.sql
-- Treffsicherheit der unscharfen Suche (Produkte + Anbieter).
--
-- Problem (Bsp. Suche "kleidung"):
--   * Echte Kleidungsartikel matchen STARK: ihr search_text enthaelt die
--     Kategorie-Uebersetzungen "bekleidung"/"kleding"/"clothing", also als
--     echter Teilstring  LIKE '%kleidung%'.
--   * Kabel matchen NUR ueber die Tippfehler-Toleranz (<% word_similarity):
--     "litzenleitung"/"leitung" ist trigramm-aehnlich zu "kleidung"
--     (word_similarity ~0.67 > Schwelle 0.45).
--   * Das bisherige Ranking sortierte nach similarity(name, q). Da die
--     Kabel-NAMEN "Leitung" enthalten, die Kleidungs-Namen aber Artikel-/
--     Markennamen sind (ohne "kleidung"), landeten die Kabel ganz oben.
--
-- Fix:
--   * Pro Token einen STARKEN Match definieren = Teilstring ODER Synonym als
--     ganzes Wort (OHNE Fuzzy). Daraus einen _score (Summe starker Token).
--   * Reine Fuzzy-Treffer (_score = 0) ausblenden, SOBALD es ueberhaupt einen
--     Treffer mit _score > 0 gibt. Gibt es gar keinen starken Treffer (echter
--     Tippfehler), bleibt die Fuzzy-Toleranz als Fallback erhalten.
--   * Ranking zuerst nach _score DESC, dann wie bisher (Name exakt/Prefix/
--     Namensaehnlichkeit, zuletzt created_at).
--   * WHERE-Logik (Trefferkandidaten) bleibt unveraendert -> keine echten
--     Treffer gehen verloren, nur die Reihenfolge/Fuzzy-Rauschen wird sauber.

-- ── Produkte ──
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
  v_q        text := extensions.unaccent(lower(coalesce(q, '')));
  v_tokens   text[];
  tok        text;
  grp        text[];
  term       text;
  cond       text;      -- vollstaendige Bedingung (inkl. Fuzzy) fuer WHERE
  strong     text;      -- starke Bedingung (ohne Fuzzy) fuer das Ranking
  parts      text[] := '{}';
  score_terms text[] := '{}';
  v_where    text;
  v_score    text;
  v_sql      text;
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

    -- Starke Bedingung: Original-Token als Teilstring + Synonyme als ganze Woerter.
    strong := format('b.search_text LIKE %L', '%' || tok || '%');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          strong := strong || format(' OR b.search_text ~ %L', '\y' || term || '\y');
        END IF;
      END LOOP;
    END IF;

    -- Vollstaendige Bedingung = stark ODER Tippfehler-Toleranz (Wort-Aehnlichkeit).
    cond := strong;
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

-- ── Anbieter ──
CREATE OR REPLACE FUNCTION public.search_providers(
  q text,
  p_countries text[] DEFAULT NULL,
  p_limit int DEFAULT 2000,
  p_offset int DEFAULT 0
) RETURNS SETOF public.service_providers
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
      SELECT p.* FROM public.service_providers p
      WHERE (p_countries IS NULL OR p.country = ANY(p_countries))
      ORDER BY coalesce(p.rating, 0) DESC, p.name
      LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  FOREACH tok IN ARRAY v_tokens LOOP
    SELECT array_agg(DISTINCT x) INTO grp FROM (
      SELECT unnest(s.terms) AS x FROM public.search_synonyms s WHERE tok = ANY(s.terms)
    ) g;

    strong := format('b.search_text LIKE %L', '%' || tok || '%');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          strong := strong || format(' OR b.search_text ~ %L', '\y' || term || '\y');
        END IF;
      END LOOP;
    END IF;

    cond := strong;
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
             b.name   AS _name,
             b.rating AS _rating,
             (%s)     AS _score
      FROM public.service_providers b
      WHERE (%L::text[] IS NULL OR b.country = ANY(%L::text[]))
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
      coalesce(r._rating, 0) DESC, r._name
    LIMIT %s OFFSET %s
  $f$,
    v_score,
    p_countries, p_countries,
    v_where,
    v_q, v_q || '%', v_q,
    p_limit, p_offset
  );

  RETURN QUERY EXECUTE v_sql;
END $$;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 198: Suche rankt starke Treffer (Teilstring/Synonym) vor Fuzzy; reines Tippfehler-Rauschen wird ausgeblendet, solange echte Treffer existieren.';
END $$;
