-- =====================================================================
-- 195_news_comments — Kommentare zu News-Beiträgen (Rückfragen/Ergänzungen,
-- wie bei Facebook). Werden per Klick unter dem Beitrag geöffnet.
-- Autor-Name/-Bild als Snapshot (wie bei news_posts), damit die Anzeige
-- ohne Join auf profiles funktioniert.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.news_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    author_id         UUID NOT NULL DEFAULT auth.uid(),
    author_name       TEXT NOT NULL DEFAULT '',
    author_avatar_url TEXT NOT NULL DEFAULT '',
    body              TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_comments_post ON public.news_comments(post_id, created_at);

ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;

-- Lesen: Kommentare veröffentlichter Beiträge (oder eigene) für Angemeldete.
DROP POLICY IF EXISTS news_comments_select ON public.news_comments;
CREATE POLICY news_comments_select ON public.news_comments
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.news_posts p
        WHERE p.id = news_comments.post_id
          AND (p.status = 'published' OR p.author_id = auth.uid() OR public.is_admin())
    ));

-- Schreiben: eigener Kommentar (author_id = auth.uid()), nichtleerer Text,
-- nur auf veröffentlichten Beiträgen.
DROP POLICY IF EXISTS news_comments_insert ON public.news_comments;
CREATE POLICY news_comments_insert ON public.news_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND length(btrim(body)) > 0
        AND EXISTS (SELECT 1 FROM public.news_posts p WHERE p.id = news_comments.post_id AND p.status = 'published')
    );

-- Löschen: eigener Kommentar, Beitrags-Autor oder Admin.
DROP POLICY IF EXISTS news_comments_delete ON public.news_comments;
CREATE POLICY news_comments_delete ON public.news_comments
    FOR DELETE TO authenticated
    USING (
        author_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (SELECT 1 FROM public.news_posts p WHERE p.id = news_comments.post_id AND p.author_id = auth.uid())
    );

GRANT SELECT, INSERT, DELETE ON public.news_comments TO authenticated;
