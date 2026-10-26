-- =====================================================================
-- 182_news_feed.sql  —  News-Feed „Tipps & Tricks" (Phase 1)
-- Eigner stellen kostenlos Problemloesungen vor; Provider stellen Produkte
-- in gleicher Form vor (mit „Zum Shop"-Button). KI-Moderation setzt den
-- Status (published / pending_review / blocked). Admin moderiert Zweifelsfaelle.
-- =====================================================================

-- ── Beitraege
CREATE TABLE IF NOT EXISTS public.news_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id         UUID NOT NULL DEFAULT auth.uid(),
    author_role       TEXT NOT NULL DEFAULT 'owner' CHECK (author_role IN ('owner','provider')),
    provider_id       UUID REFERENCES public.service_providers(id) ON DELETE SET NULL,
    kind              TEXT NOT NULL DEFAULT 'solution' CHECK (kind IN ('solution','product')),
    title             TEXT NOT NULL,
    subtitle          TEXT DEFAULT '',          -- optionaler Kurztitel
    boat_ref          TEXT DEFAULT '',          -- „fuer welches Schiff"
    equipment_ref     TEXT DEFAULT '',          -- „fuer welche Ausruestung"
    body              TEXT DEFAULT '',          -- Loesungsweg / Produktbeschreibung
    shop_url          TEXT DEFAULT '',          -- nur product: Deeplink/URL in den Shop
    product_id        UUID REFERENCES public.metashop_products(id) ON DELETE SET NULL,
    status            TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('published','pending_review','blocked','rejected')),
    moderation_reason TEXT DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_news_posts_feed
    ON public.news_posts (status, kind, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_author ON public.news_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_news_posts_provider ON public.news_posts (provider_id);

-- ── Medien (Phase 1 nur image; video-Spalte bereits vorbereitet), max. 5 je Post
CREATE TABLE IF NOT EXISTS public.news_post_media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    media_type  TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
    url         TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_post_media_post ON public.news_post_media (post_id, sort_order);

CREATE OR REPLACE FUNCTION public.check_max_news_media()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT count(*) FROM public.news_post_media WHERE post_id = NEW.post_id) >= 5 THEN
        RAISE EXCEPTION 'Maximal 5 Medien pro Beitrag.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_check_max_news_media ON public.news_post_media;
CREATE TRIGGER trg_check_max_news_media
    BEFORE INSERT ON public.news_post_media
    FOR EACH ROW EXECUTE FUNCTION public.check_max_news_media();

-- ── Nutzer-Meldungen
CREATE TABLE IF NOT EXISTS public.news_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL DEFAULT auth.uid(),
    reason      TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_news_reports_post ON public.news_reports (post_id);

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.news_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_reports    ENABLE ROW LEVEL SECURITY;

-- news_posts: lesen = veroeffentlichte ODER eigene ODER Admin
DROP POLICY IF EXISTS news_posts_select ON public.news_posts;
CREATE POLICY news_posts_select ON public.news_posts
    FOR SELECT TO authenticated
    USING (status = 'published' OR author_id = auth.uid() OR public.is_admin());

-- insert nur fuer sich selbst und NUR als pending_review — Veroeffentlichen macht
-- ausschliesslich die Edge Function create-news-post per Service-Role nach Moderation.
DROP POLICY IF EXISTS news_posts_insert ON public.news_posts;
CREATE POLICY news_posts_insert ON public.news_posts
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid() AND status = 'pending_review');

-- update/delete: eigener Autor oder Admin
DROP POLICY IF EXISTS news_posts_update ON public.news_posts;
CREATE POLICY news_posts_update ON public.news_posts
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin())
    WITH CHECK (author_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS news_posts_delete ON public.news_posts;
CREATE POLICY news_posts_delete ON public.news_posts
    FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.is_admin());

-- news_post_media: lesen wenn der Post sichtbar ist; schreiben wenn der Post dem Nutzer gehoert oder Admin
DROP POLICY IF EXISTS news_media_select ON public.news_post_media;
CREATE POLICY news_media_select ON public.news_post_media
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.news_posts p WHERE p.id = post_id
                   AND (p.status = 'published' OR p.author_id = auth.uid() OR public.is_admin())));
DROP POLICY IF EXISTS news_media_write ON public.news_post_media;
CREATE POLICY news_media_write ON public.news_post_media
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.news_posts p WHERE p.id = post_id
                   AND (p.author_id = auth.uid() OR public.is_admin())))
    WITH CHECK (EXISTS (SELECT 1 FROM public.news_posts p WHERE p.id = post_id
                   AND (p.author_id = auth.uid() OR public.is_admin())));

-- news_reports: jeder authentifizierte darf melden; lesen = Admin oder eigener Report
DROP POLICY IF EXISTS news_reports_insert ON public.news_reports;
CREATE POLICY news_reports_insert ON public.news_reports
    FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS news_reports_select ON public.news_reports;
CREATE POLICY news_reports_select ON public.news_reports
    FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS news_reports_update ON public.news_reports;
CREATE POLICY news_reports_update ON public.news_reports
    FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =====================================================================
-- Feed-RPC: mischt veroeffentlichte Eigner-Loesungen mit Provider-Produkten
-- im Verhaeltnis 3:1 (nach je 3 solution-Posts folgt 1 product-Post).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.news_feed(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS SETOF public.news_posts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sol  public.news_posts;
    prod public.news_posts;
    sol_cur CURSOR FOR
        SELECT * FROM public.news_posts
        WHERE status = 'published' AND kind = 'solution'
        ORDER BY published_at DESC NULLS LAST, created_at DESC;
    prod_cur CURSOR FOR
        SELECT * FROM public.news_posts
        WHERE status = 'published' AND kind = 'product'
        ORDER BY published_at DESC NULLS LAST, created_at DESC;
    emitted INT := 0;
    skipped INT := 0;
    since_product INT := 0;
    have_prod BOOLEAN := false;
BEGIN
    OPEN sol_cur; OPEN prod_cur;
    LOOP
        FETCH sol_cur INTO sol;
        EXIT WHEN NOT FOUND;
        -- Eigner-Beitrag ausgeben (mit Offset/Limit)
        IF skipped < p_offset THEN skipped := skipped + 1; ELSE
            RETURN NEXT sol; emitted := emitted + 1;
            IF emitted >= p_limit THEN EXIT; END IF;
        END IF;
        since_product := since_product + 1;
        -- nach je 3 Eigner-Beitraegen 1 Provider-Beitrag einschieben
        IF since_product >= 3 THEN
            FETCH prod_cur INTO prod;
            have_prod := FOUND;
            since_product := 0;
            IF have_prod THEN
                IF skipped < p_offset THEN skipped := skipped + 1; ELSE
                    RETURN NEXT prod; emitted := emitted + 1;
                    IF emitted >= p_limit THEN EXIT; END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;
    CLOSE sol_cur; CLOSE prod_cur;
    RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.news_feed(INT, INT) TO authenticated;

-- =====================================================================
-- Storage: oeffentlicher Bucket fuer News-Medien. Pfad: <auth.uid>/<datei>.
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-media', 'news-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS news_media_select ON storage.objects;
CREATE POLICY news_media_select ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'news-media');

DROP POLICY IF EXISTS news_media_insert ON storage.objects;
CREATE POLICY news_media_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'news-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS news_media_update ON storage.objects;
CREATE POLICY news_media_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'news-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS news_media_delete ON storage.objects;
CREATE POLICY news_media_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'news-media' AND (storage.foldername(name))[1] = auth.uid()::text);
