-- =====================================================================
-- 190_news_search — Volltext-ähnliche Suche im News-Feed.
-- Eigner suchen oben in der News-Rubrik nach Lösungen für bestimmte
-- Ausrüstung (z. B. "Impeller", "Volvo Penta D2-40", "Ankerwinsch").
--
-- Durchsucht veröffentlichte Beiträge (Lösungen UND Produkte) in
-- title, subtitle, equipment_ref, boat_ref und body. Jeder Suchbegriff
-- (durch Leerzeichen getrennt) muss in mindestens einem Feld vorkommen
-- (UND-Verknüpfung). Ranking: Treffer in Ausrüstung/Titel vor Treffern
-- nur im Text, danach Aktualität.
--
-- Gleiche Rückgabeform wie news_feed (SETOF news_posts), damit die
-- Frontends dieselbe Darstellung/Media-Zuordnung nutzen können.
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
            btrim(coalesce(p_query, ''))                                   AS raw,
            -- einzelne Suchbegriffe (max. 6, je >= 2 Zeichen)
            (SELECT array_agg(tok) FROM (
                SELECT tok FROM unnest(
                    regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '\s+')
                ) AS tok
                WHERE length(tok) >= 2
                LIMIT 6
            ) s)                                                           AS tokens
    )
    SELECT p.*
    FROM public.news_posts p, q
    WHERE p.status = 'published'
      AND q.tokens IS NOT NULL
      AND NOT EXISTS (
          -- jeder Begriff muss irgendwo vorkommen
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
        -- Ausrüstungs-/Titel-Treffer zuerst
        (EXISTS (
            SELECT 1 FROM unnest(q.tokens) AS needle
            WHERE position(needle IN lower(coalesce(p.equipment_ref,'') || ' ' || coalesce(p.title,''))) > 0
        )) DESC,
        p.published_at DESC NULLS LAST,
        p.created_at DESC
    LIMIT greatest(p_limit, 1)
    OFFSET greatest(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.news_search(TEXT, INT, INT) TO authenticated;
