-- =====================================================================
-- 184_news_ad_campaigns.sql  —  Phase 3: bezahlte Ad-Schaltung
-- Provider bewerben Produkt-Beiträge im News-Feed. Gratis-Kontingent
-- (Pro 2/Woche, Enterprise 4/Woche) → Kampagne sofort aktiv; darüber hinaus
-- Tagesbudget-Vorkasse via Stripe Checkout. Aktive Kampagnen erhalten im
-- Feed-Produkt-Slot Priorität (höheres Budget zuerst).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.news_ad_campaigns (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id            UUID NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    provider_id        UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
    created_by         UUID NOT NULL DEFAULT auth.uid(),
    daily_budget_cents INT  NOT NULL DEFAULT 1000 CHECK (daily_budget_cents >= 1000),
    start_date         DATE NOT NULL DEFAULT current_date,
    end_date           DATE NOT NULL DEFAULT current_date,
    preferred_hour     INT  CHECK (preferred_hour IS NULL OR (preferred_hour BETWEEN 0 AND 23)),
    days               INT  NOT NULL DEFAULT 1,
    total_cents        INT  NOT NULL DEFAULT 0,
    is_paid            BOOLEAN NOT NULL DEFAULT false,
    status             TEXT NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN ('active','pending_payment','completed','canceled')),
    stripe_session_id  TEXT,
    paid_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_ad_campaigns_post ON public.news_ad_campaigns(post_id);
CREATE INDEX IF NOT EXISTS idx_news_ad_campaigns_provider ON public.news_ad_campaigns(provider_id);
CREATE INDEX IF NOT EXISTS idx_news_ad_campaigns_active ON public.news_ad_campaigns(status, start_date, end_date);

ALTER TABLE public.news_ad_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_ad_select ON public.news_ad_campaigns;
CREATE POLICY news_ad_select ON public.news_ad_campaigns
    FOR SELECT TO authenticated
    USING (public.provider_is_member(provider_id) OR public.is_admin());

DROP POLICY IF EXISTS news_ad_insert ON public.news_ad_campaigns;
CREATE POLICY news_ad_insert ON public.news_ad_campaigns
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid() AND public.provider_is_member(provider_id));

DROP POLICY IF EXISTS news_ad_update ON public.news_ad_campaigns;
CREATE POLICY news_ad_update ON public.news_ad_campaigns
    FOR UPDATE TO authenticated
    USING (public.provider_is_member(provider_id) OR public.is_admin())
    WITH CHECK (public.provider_is_member(provider_id) OR public.is_admin());

DROP POLICY IF EXISTS news_ad_delete ON public.news_ad_campaigns;
CREATE POLICY news_ad_delete ON public.news_ad_campaigns
    FOR DELETE TO authenticated
    USING (public.provider_is_member(provider_id) OR public.is_admin());

-- =====================================================================
-- Feed-RPC neu: Produkt-Slot bevorzugt Posts mit aktiver Kampagne (höheres
-- Budget zuerst, dann Nähe zur Wunsch-Uhrzeit), sonst normale Rotation.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.news_feed(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS SETOF public.news_posts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sol  public.news_posts;
    prod public.news_posts;
    cur_hour INT := EXTRACT(hour FROM now())::INT;
    sol_cur CURSOR FOR
        SELECT * FROM public.news_posts
        WHERE status = 'published' AND kind = 'solution'
        ORDER BY published_at DESC NULLS LAST, created_at DESC;
    prod_cur CURSOR FOR
        SELECT p.* FROM public.news_posts p
        LEFT JOIN (
            SELECT post_id,
                   bool_or(status = 'active' AND current_date BETWEEN start_date AND end_date) AS active,
                   max(daily_budget_cents) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS bud,
                   min(abs(coalesce(preferred_hour, cur_hour) - cur_hour)) FILTER (WHERE status = 'active' AND current_date BETWEEN start_date AND end_date) AS hour_dist
            FROM public.news_ad_campaigns GROUP BY post_id
        ) c ON c.post_id = p.id
        WHERE p.status = 'published' AND p.kind = 'product'
        ORDER BY (c.active IS TRUE) DESC, c.bud DESC NULLS LAST, c.hour_dist ASC NULLS LAST,
                 p.published_at DESC NULLS LAST, p.created_at DESC;
    emitted INT := 0;
    skipped INT := 0;
    since_product INT := 0;
    have_prod BOOLEAN := false;
BEGIN
    OPEN sol_cur; OPEN prod_cur;
    LOOP
        FETCH sol_cur INTO sol;
        EXIT WHEN NOT FOUND;
        IF skipped < p_offset THEN skipped := skipped + 1; ELSE
            RETURN NEXT sol; emitted := emitted + 1;
            IF emitted >= p_limit THEN EXIT; END IF;
        END IF;
        since_product := since_product + 1;
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
