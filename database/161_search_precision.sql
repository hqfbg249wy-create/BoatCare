-- 161_search_precision.sql
-- Praezision der unscharfen Suche (Produkte + Anbieter).
-- Problem: kurze Synonyme wie 'tau' oder 'fall' matchten als TEILSTRING
--   -> "Tauwerk" lieferte z.B. Cristec-Trenndioden (search_text enthielt
--      "fall" innerhalb von "Ausfall"). Auch der Dokument-Similarity-Fallback
--      war zu grob.
-- Fix:
--   * Original-Token weiterhin als Teilstring (erlaubt Teil-/Praefix-Eingabe).
--   * SYNONYM-Begriffe nur noch als GANZE WOERTER (Wortgrenzen-Regex \y..\y).
--   * Tippfehler-Toleranz (word_similarity <%) bleibt.
--   * Grober Dokument-Similarity-Fallback in der WHERE-Klausel entfernt
--     (Similarity nur noch fuers Ranking).

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
  v_q      text := extensions.unaccent(lower(coalesce(q, '')));
  v_tokens text[];
  tok      text;
  grp      text[];
  term     text;
  cond     text;
  parts    text[] := '{}';
  v_where  text;
  v_sql    text;
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

    -- Original-Token: Teilstring (Teil-/Praefix-Eingabe erlaubt).
    cond := format('b.search_text LIKE %L', '%' || tok || '%');
    -- Synonyme: nur als GANZE WOERTER (verhindert 'fall' in 'ausfall' etc.).
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          cond := cond || format(' OR b.search_text ~ %L', '\y' || term || '\y');
        END IF;
      END LOOP;
    END IF;
    -- Tippfehler-Toleranz (Wort-Aehnlichkeit, index-gestuetzt).
    IF length(tok) >= 3 THEN
      cond := cond || format(' OR (%L <%% b.search_text)', tok);
    END IF;
    parts := parts || ('(' || cond || ')');
  END LOOP;

  v_where := array_to_string(parts, ' AND ');

  v_sql := format($f$
    SELECT b.* FROM public.metashop_products b
    WHERE b.is_active
      AND (%L::uuid IS NULL OR b.category_id = %L::uuid)
      AND (%L::uuid IS NULL OR b.provider_id = %L::uuid)
      AND ( %s )
    ORDER BY
      (extensions.unaccent(lower(coalesce(b.name,''))) = %L) DESC,
      (extensions.unaccent(lower(coalesce(b.name,''))) LIKE %L) DESC,
      extensions.similarity(coalesce(b.name,''), %L) DESC,
      b.created_at DESC, b.id
    LIMIT %s OFFSET %s
  $f$,
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
  v_q      text := extensions.unaccent(lower(coalesce(q, '')));
  v_tokens text[];
  tok      text;
  grp      text[];
  term     text;
  cond     text;
  parts    text[] := '{}';
  v_where  text;
  v_sql    text;
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

    cond := format('b.search_text LIKE %L', '%' || tok || '%');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          cond := cond || format(' OR b.search_text ~ %L', '\y' || term || '\y');
        END IF;
      END LOOP;
    END IF;
    IF length(tok) >= 3 THEN
      cond := cond || format(' OR (%L <%% b.search_text)', tok);
    END IF;
    parts := parts || ('(' || cond || ')');
  END LOOP;

  v_where := array_to_string(parts, ' AND ');

  v_sql := format($f$
    SELECT b.* FROM public.service_providers b
    WHERE (%L::text[] IS NULL OR b.country = ANY(%L::text[]))
      AND ( %s )
    ORDER BY
      (extensions.unaccent(lower(coalesce(b.name,''))) = %L) DESC,
      (extensions.unaccent(lower(coalesce(b.name,''))) LIKE %L) DESC,
      extensions.similarity(coalesce(b.name,''), %L) DESC,
      coalesce(b.rating, 0) DESC, b.name
    LIMIT %s OFFSET %s
  $f$,
    p_countries, p_countries,
    v_where,
    v_q, v_q || '%', v_q,
    p_limit, p_offset
  );

  RETURN QUERY EXECUTE v_sql;
END $$;
