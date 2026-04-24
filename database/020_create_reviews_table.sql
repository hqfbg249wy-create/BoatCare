-- ============================================
-- 020: Reviews-Tabelle + RPC-Funktionen
-- Idempotent: kann mehrfach ausgefuehrt werden
-- Spalte heisst service_provider_id (nicht provider_id)
-- ============================================

-- 0. Alte RPC-Funktionen entfernen (werden unten neu erstellt)
DROP FUNCTION IF EXISTS submit_review(UUID, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS delete_review(UUID, UUID);

-- 1. Reviews-Tabelle erstellen (nur falls noch nicht vorhanden)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL CHECK (char_length(comment) >= 1),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (service_provider_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON reviews(service_provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- 2. RLS aktivieren
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent: erst loeschen falls vorhanden, dann erstellen)
DROP POLICY IF EXISTS "reviews_select_public" ON reviews;
CREATE POLICY "reviews_select_public"
    ON reviews FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "reviews_insert_own" ON reviews;
CREATE POLICY "reviews_insert_own"
    ON reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_update_own" ON reviews;
CREATE POLICY "reviews_update_own"
    ON reviews FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_delete_own" ON reviews;
CREATE POLICY "reviews_delete_own"
    ON reviews FOR DELETE
    USING (auth.uid() = user_id);

-- 3. Sicherstellen dass review_count Spalte in service_providers existiert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_providers' AND column_name = 'review_count'
    ) THEN
        ALTER TABLE service_providers ADD COLUMN review_count INTEGER DEFAULT 0;
        RAISE NOTICE 'Spalte review_count wurde hinzugefuegt';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_providers' AND column_name = 'rating'
    ) THEN
        ALTER TABLE service_providers ADD COLUMN rating DOUBLE PRECISION DEFAULT 0;
        RAISE NOTICE 'Spalte rating wurde hinzugefuegt';
    END IF;
END $$;

-- 4. RPC-Funktion: Review speichern + Durchschnitt aktualisieren
CREATE OR REPLACE FUNCTION submit_review(
    p_provider_id UUID,
    p_user_id UUID,
    p_rating INTEGER,
    p_comment TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_review_id UUID;
    v_avg_rating DOUBLE PRECISION;
    v_review_count INTEGER;
BEGIN
    -- Review einfuegen oder aktualisieren (upsert)
    INSERT INTO reviews (service_provider_id, user_id, rating, comment, updated_at)
    VALUES (p_provider_id, p_user_id, p_rating, p_comment, now())
    ON CONFLICT (service_provider_id, user_id)
    DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        updated_at = now()
    RETURNING id INTO v_review_id;

    -- Durchschnitt und Anzahl neu berechnen
    SELECT
        ROUND(AVG(r.rating)::numeric, 1)::double precision,
        COUNT(*)::integer
    INTO v_avg_rating, v_review_count
    FROM reviews r
    WHERE r.service_provider_id = p_provider_id;

    -- service_providers aktualisieren
    UPDATE service_providers
    SET rating = v_avg_rating,
        review_count = v_review_count
    WHERE id = p_provider_id;

    RETURN json_build_object(
        'review_id', v_review_id,
        'avg_rating', v_avg_rating,
        'review_count', v_review_count
    );
END;
$$;

-- 5. RPC-Funktion: Review loeschen + Durchschnitt aktualisieren
CREATE OR REPLACE FUNCTION delete_review(
    p_review_id UUID,
    p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_provider_id UUID;
    v_avg_rating DOUBLE PRECISION;
    v_review_count INTEGER;
BEGIN
    -- Provider-ID ermitteln
    SELECT r.service_provider_id INTO v_provider_id
    FROM reviews r
    WHERE r.id = p_review_id AND r.user_id = p_user_id;

    IF v_provider_id IS NULL THEN
        RETURN json_build_object('error', 'Review not found or not owned by user');
    END IF;

    DELETE FROM reviews WHERE id = p_review_id AND user_id = p_user_id;

    -- Durchschnitt neu berechnen
    SELECT
        ROUND(AVG(r.rating)::numeric, 1)::double precision,
        COUNT(*)::integer
    INTO v_avg_rating, v_review_count
    FROM reviews r
    WHERE r.service_provider_id = v_provider_id;

    -- service_providers aktualisieren
    UPDATE service_providers
    SET rating = COALESCE(v_avg_rating, 0),
        review_count = COALESCE(v_review_count, 0)
    WHERE id = v_provider_id;

    RETURN json_build_object(
        'deleted', true,
        'avg_rating', COALESCE(v_avg_rating, 0),
        'review_count', COALESCE(v_review_count, 0)
    );
END;
$$;

-- 6. Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';

-- 7. Pruefe Ergebnis
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'reviews'
ORDER BY ordinal_position;
