-- ============================================
-- 021: Admin-Review-Moderation
-- Erlaubt Admins, beliebige Reviews zu loeschen
-- (Hatespeech-Entfernung)
-- ============================================

-- 1. RLS-Policy: Admins duerfen alle Reviews loeschen
DROP POLICY IF EXISTS "reviews_delete_admin" ON reviews;
CREATE POLICY "reviews_delete_admin"
    ON reviews FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- 2. RPC-Funktion: Admin loescht Review + Durchschnitt wird aktualisiert
CREATE OR REPLACE FUNCTION admin_delete_review(p_review_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_provider_id UUID;
    v_avg_rating DOUBLE PRECISION;
    v_review_count INTEGER;
BEGIN
    -- Admin-Berechtigung pruefen
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN json_build_object('error', 'Nicht berechtigt');
    END IF;

    -- Provider-ID ermitteln
    SELECT service_provider_id INTO v_provider_id
    FROM reviews WHERE id = p_review_id;

    IF v_provider_id IS NULL THEN
        RETURN json_build_object('error', 'Bewertung nicht gefunden');
    END IF;

    -- Review loeschen
    DELETE FROM reviews WHERE id = p_review_id;

    -- Durchschnitt neu berechnen
    SELECT
        ROUND(AVG(r.rating)::numeric, 1)::double precision,
        COUNT(*)::integer
    INTO v_avg_rating, v_review_count
    FROM reviews r
    WHERE r.service_provider_id = v_provider_id;

    -- Provider aktualisieren
    UPDATE service_providers
    SET rating = COALESCE(v_avg_rating, 0),
        review_count = COALESCE(v_review_count, 0)
    WHERE id = v_provider_id;

    RETURN json_build_object(
        'deleted', true,
        'provider_id', v_provider_id,
        'avg_rating', COALESCE(v_avg_rating, 0),
        'review_count', COALESCE(v_review_count, 0)
    );
END;
$$;

-- 3. Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
