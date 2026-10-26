-- 213_news_feed_recency.sql
-- News-Feed chronologisch: die NEUESTEN Beitraege stehen oben, unabhaengig vom
-- Typ (Eigner-Loesung oder Produktvorstellung). Vorher wurden ueber die
-- 3:1-Mischung zuerst alle Loesungen gezeigt, wodurch eine brandneue
-- Produktvorstellung unter aelteren Loesungen landete.
--
-- Neu: ein gemeinsamer, nach created_at DESC sortierter Feed. Aktive bezahlte
-- Werbe-Kampagnen (Phase 3) behalten ihren Vorrang ganz oben; innerhalb der
-- Kampagnen und fuer alle organischen Beitraege gilt Aktualitaet.
CREATE OR REPLACE FUNCTION public.news_feed(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS SETOF public.news_posts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    cur_hour INT := EXTRACT(hour FROM now())::INT;
BEGIN
    RETURN QUERY
    SELECT p.*
    FROM public.news_posts p
    LEFT JOIN (
        SELECT post_id,
               bool_or(status = 'active' AND current_date BETWEEN start_date AND end_date) AS active,
               max(daily_budget_cents) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS bud,
               min(abs(coalesce(preferred_hour, cur_hour) - cur_hour)) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS hour_dist
        FROM public.news_ad_campaigns GROUP BY post_id
    ) c ON c.post_id = p.id
    WHERE p.status = 'published'
    ORDER BY
        (c.active IS TRUE) DESC,                 -- aktive bezahlte Anzeigen zuerst
        c.bud DESC NULLS LAST,
        c.hour_dist ASC NULLS LAST,
        p.created_at DESC                        -- sonst: neueste zuerst
    LIMIT p_limit OFFSET p_offset;
END; $$;

GRANT EXECUTE ON FUNCTION public.news_feed(INT, INT) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 213: News-Feed chronologisch (neueste oben); aktive Anzeigen behalten Vorrang.';
END $$;
