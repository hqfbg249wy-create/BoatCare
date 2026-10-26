-- 202_provider_search_relevance.sql
-- Treffsicherheit der ANBIETER-Suche (Marke + Ort, Sprachvarianten).
--
-- Probleme (verifiziert):
--   * "onesail germany" -> 0 Treffer (germany != deutschland; onesail != "one sails").
--   * "one sails travemuende" -> "Fluid-elec Chandlery" (Fuzzy-Rauschen),
--     weil hartes UND + ein nicht passendes Ortswort die Suche zerlegt.
--
-- Fix:
--   (A) Mehrsprachige LAENDER-Synonyme (germany<->deutschland usw.), damit die
--       Ortsangabe sprachunabhaengig trifft.
--   (B) search_providers neu:
--       - Kandidaten ueber ODER (irgendein Wort trifft) statt UND -> ein nicht
--         passendes Wort killt die Suche nicht mehr.
--       - Relevanz-Score = Anzahl STARK getroffener Woerter (Wortgrenze +
--         Synonyme + leerzeichen-unempfindlicher Markenabgleich).
--       - Es wird nur der BESTE Treffer-Tier zurueckgegeben (score = max) ->
--         "one sails deutschland" liefert exakt den deutschen OneSails,
--         "onesail germany" den deutschen OneSails, Rauschen faellt raus.
--       - Leerzeichen-/Bindestrich-unempfindlich (nur Woerter ab 5 Zeichen),
--         damit "onesail"/"onesails"/"one sails" aufeinander passen.
-- Produkte-Suche (199) bleibt unveraendert (dort ist UND korrekt).

-- ─────────────────────────────────────────────────────────────────────────
-- (A) Laender-Synonyme (unakzentuiert, Kleinschreibung, Ein-Wort-Namen).
-- Nur einfuegen, wenn noch keine Gruppe eines dieser Begriffe existiert.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.search_synonyms (terms)
SELECT g FROM (VALUES
  (ARRAY['deutschland','germany','allemagne','germania','duitsland','alemania','tyskland']),
  (ARRAY['frankreich','france','francia','frankrijk']),
  (ARRAY['italien','italia','italy','italie']),
  (ARRAY['niederlande','netherlands','holland','nederland']),
  (ARRAY['spanien','spain','espana','espagne','spagna','spanje']),
  (ARRAY['kroatien','croatia','croatie','croazia','kroatie','hrvatska']),
  (ARRAY['griechenland','greece','grece','grecia','griekenland']),
  (ARRAY['schweden','sweden','suede','svezia','suecia','zweden','sverige']),
  (ARRAY['danemark','denmark','danmark','danimarca','dinamarca','denemarken']),
  (ARRAY['norwegen','norway','norvege','norvegia','noruega','noorwegen','norge']),
  (ARRAY['finnland','finland','finlande','finlandia']),
  (ARRAY['turkei','turkey','turquie','turchia','turquia','turkije','turkiye']),
  (ARRAY['schweiz','switzerland','suisse','svizzera','suiza','zwitserland']),
  (ARRAY['osterreich','austria','autriche','oostenrijk']),
  (ARRAY['belgien','belgium','belgique','belgio','belgica','belgie']),
  (ARRAY['portugal','portogallo']),
  (ARRAY['polen','poland','pologne','polonia'])
) v(g)
WHERE NOT EXISTS (
  SELECT 1 FROM public.search_synonyms s WHERE s.terms && v.g
);

-- ─────────────────────────────────────────────────────────────────────────
-- (B) search_providers neu
-- ─────────────────────────────────────────────────────────────────────────
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
  cond        text;      -- Kandidaten-Bedingung (inkl. Fuzzy) fuer WHERE (ODER)
  strong      text;      -- starke Bedingung (Wortgrenze + Synonyme + Marke) fuer Score
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

  -- Ohne verwertbare Tokens: Standardliste (nach Bewertung/Name).
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

    -- STARK: Originalwort an Wortgrenze (Anfang/Ende) ...
    strong := format('b.search_text ~ %L', '(\y' || tok || '|' || tok || '\y)');
    -- ... Synonyme als ganze Woerter ...
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          strong := strong || format(' OR b.search_text ~ %L', '\y' || term || '\y');
        END IF;
      END LOOP;
    END IF;
    -- ... und leerzeichen-/trennzeichen-unempfindlich (nur laengere Woerter),
    -- damit "onesail"/"onesails"/"one sails" aufeinander passen.
    IF length(tok) >= 5 THEN
      strong := strong || format(' OR translate(b.search_text, %L, %L) LIKE %L', ' -./', '', '%' || tok || '%');
    END IF;

    -- KANDIDAT (ODER-Verknuepfung): Teilstring + Synonyme + Marke + Fuzzy.
    cond := format('b.search_text LIKE %L', '%' || tok || '%');
    IF grp IS NOT NULL THEN
      FOREACH term IN ARRAY grp LOOP
        IF term <> tok THEN
          cond := cond || format(' OR b.search_text ~ %L', '\y' || term || '\y');
        END IF;
      END LOOP;
    END IF;
    IF length(tok) >= 5 THEN
      cond := cond || format(' OR translate(b.search_text, %L, %L) LIKE %L', ' -./', '', '%' || tok || '%');
    END IF;
    IF length(tok) >= 3 THEN
      cond := cond || format(' OR (%L <%% b.search_text)', tok);
    END IF;

    parts := parts || ('(' || cond || ')');
    score_terms := score_terms || format('(CASE WHEN (%s) THEN 1 ELSE 0 END)', strong);
  END LOOP;

  -- Kandidaten = IRGENDEIN Wort trifft (ODER).
  v_where := array_to_string(parts, ' OR ');
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
    WHERE r._score = r._maxscore          -- nur der beste Treffer-Tier
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
  RAISE NOTICE '✅ Migration 202: Anbietersuche ODER+Relevanz-Ranking + Laender-Synonyme + leerzeichenunabhaengiger Markenabgleich.';
END $$;
