-- =====================================================================
-- 187_news_author_snapshot.sql  —  Autor + Profilbild im News-Kopf
-- Snapshot von Name + Bild beim Erstellen (robust, kein Cross-User-RLS nötig).
-- Eigner → profiles.full_name/avatar_url; Provider → service_providers.name/logo_url.
-- =====================================================================

ALTER TABLE public.news_posts
    ADD COLUMN IF NOT EXISTS author_name       TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS author_avatar_url TEXT DEFAULT '';

-- Backfill: Eigner-Beiträge
UPDATE public.news_posts n
SET author_name       = COALESCE(NULLIF(p.full_name, ''), split_part(COALESCE(p.email, ''), '@', 1)),
    author_avatar_url = COALESCE(p.avatar_url, '')
FROM public.profiles p
WHERE n.kind = 'solution' AND p.id = n.author_id
  AND (n.author_name IS NULL OR n.author_name = '');

-- Backfill: Provider-Beiträge
UPDATE public.news_posts n
SET author_name       = COALESCE(sp.name, ''),
    author_avatar_url = COALESCE(sp.logo_url, '')
FROM public.service_providers sp
WHERE n.kind = 'product' AND sp.id = n.provider_id
  AND (n.author_name IS NULL OR n.author_name = '');
