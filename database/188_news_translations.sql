-- =====================================================================
-- 188_news_translations.sql  —  Automatische Text-Übersetzung von News
-- Übersetzte Titel/Untertitel/Beschreibung je Zielsprache zwischenspeichern
-- (einmal übersetzen, für alle Betrachter wiederverwenden). Die Übersetzung
-- erstellt die Edge Function `translate-news` (Claude) lazy bei Bedarf.
-- Basissprache der Inhalte ist Deutsch; Betrachter mit anderer UI-Sprache
-- bekommen die gecachte Übersetzung.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.news_post_translations (
    post_id    UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    lang       TEXT NOT NULL,                 -- Zielsprache (z.B. 'en','fr','it','es','nl')
    title      TEXT DEFAULT '',
    subtitle   TEXT DEFAULT '',
    body       TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, lang)
);

ALTER TABLE public.news_post_translations ENABLE ROW LEVEL SECURITY;

-- Lesen für alle authentifizierten (Anzeige im Feed). Schreiben nur Service-Role
-- (die Edge Function) → keine INSERT/UPDATE-Policy für normale Nutzer.
DROP POLICY IF EXISTS news_translations_select ON public.news_post_translations;
CREATE POLICY news_translations_select ON public.news_post_translations
    FOR SELECT TO authenticated USING (true);
