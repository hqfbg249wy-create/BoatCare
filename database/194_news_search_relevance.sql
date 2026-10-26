-- =====================================================================
-- 194_news_search_relevance — News-Suche: RELEVANTESTES zuerst, dann NEUESTE.
-- Ersetzt news_search (aus 190): statt eines binären "trifft/trifft nicht"
-- wird ein gewichteter Relevanz-Score berechnet. Treffer in Titel und
-- Ausrüstung zählen am meisten, danach Untertitel, dann Fließtext. Bei
-- gleichem Score entscheidet die Aktualität (published_at DESC).
--
-- Gleiche Signatur/Rückgabeform wie bisher (SETOF news_posts) -> keine
-- Client-Änderung nötig.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.news_search(
    p_query  TEXT,
    p_limit  INT DEFAULT 40,
    p_offset INT DEFAULT 0
)
RETURNS SETOF public.news_posts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH q AS (
        SELECT
            (SELECT array_agg(tok) FROM (
                SELECT tok FROM unnest(
                    regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '\s+')
                ) AS tok
                WHERE length(tok) >= 2
                LIMIT 6
            ) s) AS tokens
    )
    SELECT p.*
    FROM public.news_posts p, q
    WHERE p.status = 'published'
      AND q.tokens IS NOT NULL
      -- Jeder Suchbegriff muss irgendwo vorkommen (UND-Verknüpfung).
      AND NOT EXISTS (
          SELECT 1 FROM unnest(q.tokens) AS needle
          WHERE position(needle IN lower(
                  coalesce(p.title,'')        || ' ' ||
                  coalesce(p.subtitle,'')     || ' ' ||
                  coalesce(p.equipment_ref,'')|| ' ' ||
                  coalesce(p.boat_ref,'')     || ' ' ||
                  coalesce(p.body,'')
              )) = 0
      )
    ORDER BY
        -- Gewichteter Relevanz-Score: Titel/Ausrüstung > Untertitel/Boot > Text.
        (
          SELECT coalesce(sum(
              (CASE WHEN position(needle IN lower(coalesce(p.title,'')))         > 0 THEN 3 ELSE 0 END) +
              (CASE WHEN position(needle IN lower(coalesce(p.equipment_ref,''))) > 0 THEN 3 ELSE 0 END) +
              (CASE WHEN position(needle IN lower(coalesce(p.subtitle,'')))      > 0 THEN 2 ELSE 0 END) +
              (CASE WHEN position(needle IN lower(coalesce(p.boat_ref,'')))      > 0 THEN 2 ELSE 0 END) +
              (CASE WHEN position(needle IN lower(coalesce(p.body,'')))          > 0 THEN 1 ELSE 0 END)
          ), 0)
          FROM unnest(q.tokens) AS needle
        ) DESC,
        p.published_at DESC NULLS LAST,
        p.created_at DESC
    LIMIT greatest(p_limit, 1)
    OFFSET greatest(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.news_search(TEXT, INT, INT) TO authenticated;
