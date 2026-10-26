-- 214_news_feed_german_text.sql
-- Serverseitige News-Uebersetzung fuer die (unveraenderte) iOS-App:
-- news_feed gibt Titel/Untertitel/Text gleich AUF DEUTSCH zurueck (aus dem
-- Cache news_post_translations, lang='de'). Damit sieht ein deutscher Nutzer
-- auch fremdsprachige Beitraege auf Deutsch, OHNE App-Build.
--
-- Fuer deutschsprachige Original-Beitraege ist die de-Uebersetzung wortgleich
-- (verbatim), das Coalesce ist also unschaedlich. Nicht-deutsche Nutzer
-- uebersetzen weiterhin clientseitig in ihre Sprache (translate-news,
-- Cache-Treffer pro Beitrag+Sprache), das ueberschreibt den deutschen Text.
--
-- Reihenfolge (neueste zuerst) und Vorrang aktiver Werbe-Kampagnen aus 213
-- bleiben erhalten.
--
-- Hinweis/Trade-off: "Original anzeigen" zeigt dadurch im Feed die deutsche
-- Fassung statt der echten Ausgangssprache. Fuer den deutschsprachigen Markt
-- akzeptabel.

CREATE OR REPLACE FUNCTION public.news_feed(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS SETOF public.news_posts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.author_id, p.author_role, p.provider_id, p.kind,
    coalesce(t.title, p.title)       AS title,
    coalesce(t.subtitle, p.subtitle) AS subtitle,
    p.boat_ref, p.equipment_ref,
    coalesce(t.body, p.body)         AS body,
    p.shop_url, p.product_id, p.status, p.moderation_reason,
    p.created_at, p.published_at, p.author_name, p.author_avatar_url
  FROM public.news_posts p
  LEFT JOIN public.news_post_translations t
    ON t.post_id = p.id AND t.lang = 'de'
  LEFT JOIN (
    SELECT post_id,
           bool_or(status = 'active' AND current_date BETWEEN start_date AND end_date) AS active,
           max(daily_budget_cents) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS bud,
           min(abs(coalesce(preferred_hour, extract(hour from now())::int) - extract(hour from now())::int))
             FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS hour_dist
    FROM public.news_ad_campaigns GROUP BY post_id
  ) c ON c.post_id = p.id
  WHERE p.status = 'published'
  ORDER BY
    (c.active IS TRUE) DESC,
    c.bud DESC NULLS LAST,
    c.hour_dist ASC NULLS LAST,
    p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.news_feed(INT, INT) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 214: news_feed liefert Texte auf Deutsch (Cache) -> deutsche Nutzer sehen fremdsprachige Beitraege uebersetzt, ohne App-Build.';
END $$;
