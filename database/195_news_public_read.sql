-- =====================================================================
-- 195_news_public_read — Veröffentlichte News auch für nicht eingeloggte
-- (anon) Betrachter vollständig lesbar machen.
--
-- Problem: Der Feed kommt über die SECURITY-DEFINER-RPC news_feed (anon darf
-- sie ausführen), aber die Lese-Policies von news_posts, news_post_media,
-- news_comments und news_post_reactions galten nur für die Rolle
-- `authenticated`. Für ausgeloggte Nutzer wurden dadurch Video, Kommentare und
-- Reaktionen per RLS ausgeblendet (Beitrag sichtbar, aber ohne Medien/Kommentare).
--
-- Fix: Die SELECT-Policies auf `anon, authenticated` ausweiten. Die Bedingungen
-- bleiben gleich und zeigen weiterhin nur VERÖFFENTLICHTE Inhalte (bzw. dem
-- Autor/Admin seine eigenen, unveröffentlichten). Schreiben/Reagieren/Melden
-- bleibt unverändert nur für eingeloggte Nutzer.
-- =====================================================================

-- news_posts: veröffentlichte Beiträge (oder eigene/Admin) lesen.
DROP POLICY IF EXISTS news_posts_select ON public.news_posts;
CREATE POLICY news_posts_select ON public.news_posts
    FOR SELECT TO anon, authenticated
    USING (status = 'published' OR author_id = auth.uid() OR public.is_admin());

-- news_post_media: Medien veröffentlichter Beiträge lesen.
DROP POLICY IF EXISTS news_media_select ON public.news_post_media;
CREATE POLICY news_media_select ON public.news_post_media
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM public.news_posts p
        WHERE p.id = news_post_media.post_id
          AND (p.status = 'published' OR p.author_id = auth.uid() OR public.is_admin())
    ));

-- news_comments: Kommentare veröffentlichter Beiträge lesen.
DROP POLICY IF EXISTS news_comments_select ON public.news_comments;
CREATE POLICY news_comments_select ON public.news_comments
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM public.news_posts p
        WHERE p.id = news_comments.post_id
          AND (p.status = 'published' OR p.author_id = auth.uid() OR public.is_admin())
    ));

-- news_post_reactions: Reaktionszahlen sind öffentlich.
DROP POLICY IF EXISTS news_reactions_select ON public.news_post_reactions;
CREATE POLICY news_reactions_select ON public.news_post_reactions
    FOR SELECT TO anon, authenticated
    USING (true);
