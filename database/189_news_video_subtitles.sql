-- =====================================================================
-- 189_news_video_subtitles.sql  —  Video-Untertitel (Teil B)
-- Transkript (Whisper, mit Zeitmarken) je Video + übersetzte WebVTT-Spur je
-- Zielsprache. Beides gecacht (einmal erzeugen, für alle Betrachter nutzen).
-- Erstellt lazy von der Edge Function `news-subtitles`.
-- =====================================================================

-- Basis-Transkript je Beitrag (ein Video pro Beitrag)
CREATE TABLE IF NOT EXISTS public.news_video_transcripts (
    post_id     UUID PRIMARY KEY REFERENCES public.news_posts(id) ON DELETE CASCADE,
    source_lang TEXT DEFAULT '',
    segments    JSONB NOT NULL DEFAULT '[]',   -- [{start, end, text}]
    status      TEXT NOT NULL DEFAULT 'ready'  -- 'ready' | 'too_large' | 'failed'
                  CHECK (status IN ('ready','too_large','failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Übersetzte Untertitelspur je Zielsprache (WebVTT)
CREATE TABLE IF NOT EXISTS public.news_video_subtitles (
    post_id    UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    lang       TEXT NOT NULL,
    vtt        TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, lang)
);

ALTER TABLE public.news_video_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_video_subtitles   ENABLE ROW LEVEL SECURITY;

-- Lesen fuer alle authentifizierten; Schreiben nur Service-Role (Edge Function).
DROP POLICY IF EXISTS news_transcripts_select ON public.news_video_transcripts;
CREATE POLICY news_transcripts_select ON public.news_video_transcripts
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS news_subtitles_select ON public.news_video_subtitles;
CREATE POLICY news_subtitles_select ON public.news_video_subtitles
    FOR SELECT TO authenticated USING (true);
