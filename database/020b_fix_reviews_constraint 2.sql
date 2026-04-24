-- ============================================
-- 020b: UNIQUE-Constraint auf reviews reparieren
-- Problem: ON CONFLICT (service_provider_id, user_id) findet keinen
--          passenden UNIQUE-Constraint
-- ============================================

-- 1. Alle bestehenden UNIQUE-Constraints auf reviews anzeigen (zur Diagnose)
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'reviews' AND con.contype = 'u';

-- 2. Alten Constraint entfernen (egal wie er heisst)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'reviews' AND con.contype = 'u'
    LOOP
        EXECUTE 'ALTER TABLE reviews DROP CONSTRAINT ' || r.conname;
        RAISE NOTICE 'Constraint % entfernt', r.conname;
    END LOOP;
END $$;

-- 3. Neuen UNIQUE-Constraint mit korrektem Spaltennamen erstellen
ALTER TABLE reviews
    ADD CONSTRAINT uq_reviews_provider_user UNIQUE (service_provider_id, user_id);

-- 4. RPC-Funktion neu erstellen (mit service_provider_id)
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
    INSERT INTO reviews (service_provider_id, user_id, rating, comment, updated_at)
    VALUES (p_provider_id, p_user_id, p_rating, p_comment, now())
    ON CONFLICT (service_provider_id, user_id)
    DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        updated_at = now()
    RETURNING id INTO v_review_id;

    SELECT
        ROUND(AVG(r.rating)::numeric, 1)::double precision,
        COUNT(*)::integer
    INTO v_avg_rating, v_review_count
    FROM reviews r
    WHERE r.service_provider_id = p_provider_id;

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

-- 5. Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';

-- 6. Pruefen ob Constraint jetzt korrekt ist
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'reviews' AND con.contype = 'u';
