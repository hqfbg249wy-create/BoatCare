-- ============================================
-- 020a: Reviews-Tabelle erstellen
-- Schritt 1 von 2: Erst DIESES Skript ausfuehren
-- Spalte heisst service_provider_id (nicht provider_id)
-- ============================================

-- Alte Reste entfernen
DROP FUNCTION IF EXISTS submit_review(UUID, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS delete_review(UUID, UUID);

-- Tabelle erstellen (nur falls noch nicht vorhanden)
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_provider_id UUID NOT NULL,
    user_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_reviews_provider FOREIGN KEY (service_provider_id)
        REFERENCES public.service_providers(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id)
        REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT uq_reviews_provider_user UNIQUE (service_provider_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON public.reviews(service_provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);

-- RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public" ON public.reviews
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "reviews_insert_own" ON public.reviews;
CREATE POLICY "reviews_insert_own" ON public.reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_update_own" ON public.reviews;
CREATE POLICY "reviews_update_own" ON public.reviews
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_delete_own" ON public.reviews;
CREATE POLICY "reviews_delete_own" ON public.reviews
    FOR DELETE USING (auth.uid() = user_id);

-- Pruefen ob rating + review_count auf service_providers existieren
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'service_providers'
          AND column_name = 'review_count'
    ) THEN
        ALTER TABLE public.service_providers ADD COLUMN review_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'service_providers'
          AND column_name = 'rating'
    ) THEN
        ALTER TABLE public.service_providers ADD COLUMN rating DOUBLE PRECISION DEFAULT 0;
    END IF;
END $$;

-- Ergebnis pruefen
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'reviews' AND table_schema = 'public'
ORDER BY ordinal_position;
