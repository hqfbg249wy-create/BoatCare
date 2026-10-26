-- 212_news_media_youtube.sql
-- Erlaubt media_type='youtube' in news_post_media, damit News-Beitraege einen
-- YouTube-Link als Video-Medium haben koennen (statt/zusaetzlich zu einem
-- hochgeladenen Video). Die URL ist dann eine normalisierte YouTube-Watch-URL.

ALTER TABLE public.news_post_media
  DROP CONSTRAINT IF EXISTS news_post_media_media_type_check;

ALTER TABLE public.news_post_media
  ADD CONSTRAINT news_post_media_media_type_check
  CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'youtube'::text]));

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 212: news_post_media erlaubt jetzt media_type=youtube.';
END $$;
