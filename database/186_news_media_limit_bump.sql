-- =====================================================================
-- 186_news_media_limit_bump.sql
-- Videos werden clientseitig komprimiert (720p + Bitrate-Limit → meist klein).
-- Das Bucket-Limit wird als Puffer auf 200 MB angehoben (falls die
-- Komprimierung im Browser nicht greift und das Original hochgeladen wird).
-- WebM ist bereits erlaubt (183).
-- =====================================================================

UPDATE storage.buckets
SET file_size_limit = 209715200  -- 200 MB
WHERE id = 'news-media';
