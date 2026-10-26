-- =====================================================================
-- 193_news_feed_fill_products — Feed auch ohne (weitere) Eigner-Beiträge.
-- Bisher brach news_feed ab, sobald keine Lösungsbeiträge mehr kamen; dann
-- wurden gar keine Produktvorstellungen gezeigt. Jetzt: nach der 3:1-Mischung
-- werden die restlichen Produktbeiträge angehängt, bis p_limit erreicht ist
-- (bzw. von Anfang an, wenn es keine Lösungsbeiträge gibt). Priorisierung der
-- aktiven Werbe-Kampagnen bleibt erhalten.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.news_feed(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS SETOF public.news_posts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sol  public.news_posts;
    prod public.news_posts;
    cur_hour INT := EXTRACT(hour FROM now())::INT;
    sol_cur CURSOR FOR
        SELECT * FROM public.news_posts
        WHERE status = 'published' AND kind = 'solution'
        ORDER BY published_at DESC NULLS LAST, created_at DESC;
    prod_cur CURSOR FOR
        SELECT p.* FROM public.news_posts p
        LEFT JOIN (
            SELECT post_id,
                   bool_or(status = 'active' AND current_date BETWEEN start_date AND end_date) AS active,
                   max(daily_budget_cents) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS bud,
                   min(abs(coalesce(preferred_hour, cur_hour) - cur_hour)) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS hour_dist
            FROM public.news_ad_campaigns GROUP BY post_id
        ) c ON c.post_id = p.id
        WHERE p.status = 'published' AND p.kind = 'product'
        ORDER BY (c.active IS TRUE) DESC, c.bud DESC NULLS LAST, c.hour_dist ASC NULLS LAST,
                 p.published_at DESC NULLS LAST, p.created_at DESC;
    emitted INT := 0;
    skipped INT := 0;
    since_product INT := 0;
    have_prod BOOLEAN := false;
BEGIN
    OPEN sol_cur; OPEN prod_cur;
    -- 1) Normale 3:1-Mischung, solange Lösungsbeiträge kommen.
    LOOP
        FETCH sol_cur INTO sol;
        EXIT WHEN NOT FOUND;
        IF skipped < p_offset THEN skipped := skipped + 1; ELSE
            RETURN NEXT sol; emitted := emitted + 1;
            IF emitted >= p_limit THEN EXIT; END IF;
        END IF;
        since_product := since_product + 1;
        IF since_product >= 3 THEN
            FETCH prod_cur INTO prod;
            have_prod := FOUND;
            since_product := 0;
            IF have_prod THEN
                IF skipped < p_offset THEN skipped := skipped + 1; ELSE
                    RETURN NEXT prod; emitted := emitted + 1;
                    IF emitted >= p_limit THEN EXIT; END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;
    -- 2) Rest mit Produktbeiträgen auffüllen (auch wenn es keine Lösungen gibt).
    WHILE emitted < p_limit LOOP
        FETCH prod_cur INTO prod;
        EXIT WHEN NOT FOUND;
        IF skipped < p_offset THEN skipped := skipped + 1; ELSE
            RETURN NEXT prod; emitted := emitted + 1;
        END IF;
    END LOOP;
    CLOSE sol_cur; CLOSE prod_cur;
    RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.news_feed(INT, INT) TO authenticated;
