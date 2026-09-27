-- 160_provider_fuzzy_search.sql
-- Unscharfe Anbieter-/Leistungssuche, analog zur Produktsuche (159) und mit
-- DERSELBEN Synonym-Tabelle. Zentral in der DB, damit iOS + Web identisch
-- profitieren. Sucht ueber Name/Stadt/Strasse/PLZ/Beschreibung, Kategorie(n)
-- UND Leistungen/Marken, mit Synonymen und Tippfehler-Toleranz.

-- ── 1) search_text-Spalte + Pflege-Trigger auf service_providers ──
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION public.provider_search_text(
  p_name text, p_city text, p_street text, p_postal text, p_description text,
  p_category text, p_category2 text, p_category3 text,
  p_categories text[], p_services text[], p_brands text[]
) RETURNS text
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT extensions.unaccent(lower(
    coalesce(p_name,'') || ' ' || coalesce(p_city,'') || ' ' ||
    coalesce(p_street,'') || ' ' || coalesce(p_postal,'') || ' ' ||
    coalesce(p_description,'') || ' ' ||
    coalesce(p_category,'') || ' ' || coalesce(p_category2,'') || ' ' || coalesce(p_category3,'') || ' ' ||
    coalesce(array_to_string(p_categories,' '),'') || ' ' ||
    coalesce(array_to_string(p_services,' '),'') || ' ' ||
    coalesce(array_to_string(p_brands,' '),'')
  ));
$$;

CREATE OR REPLACE FUNCTION public.trg_provider_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.search_text := public.provider_search_text(
    NEW.name, NEW.city, NEW.street, NEW.postal_code, NEW.description,
    NEW.category, NEW.category2, NEW.category3,
    NEW.categories, NEW.services, NEW.brands);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS provider_search_text_upd ON public.service_providers;
CREATE TRIGGER provider_search_text_upd
  BEFORE INSERT OR UPDATE OF name, city, street, postal_code, description,
    category, category2, category3, categories, services, brands
  ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.trg_provider_search_text();

-- Backfill
UPDATE public.service_providers SET search_text = public.provider_search_text(
  name, city, street, postal_code, description,
  category, category2, category3, categories, services, brands);

CREATE INDEX IF NOT EXISTS idx_providers_search_text_trgm
  ON public.service_providers USING gin (search_text extensions.gin_trgm_ops);

-- ── 2) RPC: unscharfe Anbietersuche (nutzt search_synonyms aus 159) ──
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
      SELECT tok AS x
      UNION
      SELECT unnest(s.terms) FROM public.search_synonyms s WHERE tok = ANY(s.terms)
    ) g;
    IF grp IS NULL THEN grp := ARRAY[tok]; END IF;

    cond := '';
    FOREACH term IN ARRAY grp LOOP
      IF cond <> '' THEN cond := cond || ' OR '; END IF;
      cond := cond || format('b.search_text LIKE %L', '%' || term || '%');
    END LOOP;
    IF length(tok) >= 3 THEN
      cond := cond || format(' OR (%L <%% b.search_text)', tok);
    END IF;
    parts := parts || ('(' || cond || ')');
  END LOOP;

  v_where := array_to_string(parts, ' AND ');

  v_sql := format($f$
    SELECT b.* FROM public.service_providers b
    WHERE (%L::text[] IS NULL OR b.country = ANY(%L::text[]))
      AND ( (%s) OR extensions.similarity(coalesce(b.search_text,''), %L) > 0.30 )
    ORDER BY
      (extensions.unaccent(lower(coalesce(b.name,''))) = %L) DESC,
      (extensions.unaccent(lower(coalesce(b.name,''))) LIKE %L) DESC,
      extensions.similarity(coalesce(b.name,''), %L) DESC,
      coalesce(b.rating, 0) DESC, b.name
    LIMIT %s OFFSET %s
  $f$,
    p_countries, p_countries,
    v_where, v_q,
    v_q, v_q || '%', v_q,
    p_limit, p_offset
  );

  RETURN QUERY EXECUTE v_sql;
END $$;

GRANT EXECUTE ON FUNCTION public.search_providers(text, text[], int, int) TO anon, authenticated;
