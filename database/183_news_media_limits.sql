-- =====================================================================
-- 183_news_media_limits.sql  —  Phase 2: Video in News-Beiträgen
-- Setzt Größenlimit + erlaubte Medientypen für den Bucket news-media
-- (Bilder + Video). Cap: 50 MB pro Datei.
-- =====================================================================

UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50 MB
    allowed_mime_types = ARRAY[
        'image/jpeg','image/png','image/webp','image/gif',
        'video/mp4','video/quicktime','video/webm'
    ]
WHERE id = 'news-media';
