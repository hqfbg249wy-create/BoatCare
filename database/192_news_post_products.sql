-- =====================================================================
-- 192_news_post_products — Mehrere Shop-Produkte je Produktbeitrag.
-- Ein Provider kann in einer Produktvorstellung (news_posts.kind='product')
-- mehrere seiner Shop-Produkte hinterlegen. Beim Klick auf "Im Shop ansehen"
-- werden genau diese Produkte im Shop oben angepinnt/hervorgehoben.
-- Das bestehende news_posts.product_id (Einzel-Link) bleibt für
-- Abwärtskompatibilität erhalten (= erstes Produkt der Liste).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.news_post_products (
    post_id    UUID NOT NULL REFERENCES public.news_posts(id)        ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.metashop_products(id) ON DELETE CASCADE,
    sort_order INT  NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_news_post_products_post ON public.news_post_products(post_id);

ALTER TABLE public.news_post_products ENABLE ROW LEVEL SECURITY;

-- Lesen: wie beim Beitrag selbst (veröffentlicht ODER Autor ODER Admin).
DROP POLICY IF EXISTS news_post_products_select ON public.news_post_products;
CREATE POLICY news_post_products_select ON public.news_post_products
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.news_posts p
        WHERE p.id = news_post_products.post_id
          AND (p.status = 'published' OR p.author_id = auth.uid() OR public.is_admin())
    ));

-- Schreiben/Löschen: nur der Autor des Beitrags (oder Admin).
DROP POLICY IF EXISTS news_post_products_write ON public.news_post_products;
CREATE POLICY news_post_products_write ON public.news_post_products
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.news_posts p
        WHERE p.id = news_post_products.post_id
          AND (p.author_id = auth.uid() OR public.is_admin())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.news_posts p
        WHERE p.id = news_post_products.post_id
          AND (p.author_id = auth.uid() OR public.is_admin())
    ));
