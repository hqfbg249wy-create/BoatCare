-- =====================================================================
-- 185_news_reactions.sql  —  Emoji-Likes auf News-Beiträge
-- Nutzer liken Beiträge mit Emojis; die Anzahl je Emoji ist für alle sichtbar.
-- Ein Nutzer kann je Beitrag jedes Emoji einmal vergeben (togglebar).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.news_post_reactions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL DEFAULT auth.uid(),
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_news_reactions_post ON public.news_post_reactions(post_id);

ALTER TABLE public.news_post_reactions ENABLE ROW LEVEL SECURITY;

-- Anzahl/Reaktionen sind fuer alle authentifizierten sichtbar (oeffentliche Likes).
DROP POLICY IF EXISTS news_reactions_select ON public.news_post_reactions;
CREATE POLICY news_reactions_select ON public.news_post_reactions
    FOR SELECT TO authenticated USING (true);

-- Jeder setzt/entfernt nur eigene Reaktionen.
DROP POLICY IF EXISTS news_reactions_insert ON public.news_post_reactions;
CREATE POLICY news_reactions_insert ON public.news_post_reactions
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS news_reactions_delete ON public.news_post_reactions;
CREATE POLICY news_reactions_delete ON public.news_post_reactions
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Aggregierte Zaehlung je Beitrag+Emoji (fuer die Feed-Anzeige).
CREATE OR REPLACE FUNCTION public.news_reaction_counts(p_post_ids UUID[])
RETURNS TABLE (post_id UUID, emoji TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT post_id, emoji, count(*)::bigint
    FROM public.news_post_reactions
    WHERE post_id = ANY(p_post_ids)
    GROUP BY post_id, emoji;
$$;
GRANT EXECUTE ON FUNCTION public.news_reaction_counts(UUID[]) TO authenticated;
