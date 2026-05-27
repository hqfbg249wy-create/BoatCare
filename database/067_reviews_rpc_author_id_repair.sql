-- ============================================================
-- Migration 067: Reviews-RPC und Indexes auf author_id reparieren
-- ============================================================
-- Hintergrund:
--   Migration 055 hat reviews.user_id → reviews.author_id umbenannt.
--   Die RPC submit_review aus Migration 020b schreibt aber noch in
--   die alte Spalte user_id → "column missing" beim Speichern.
--   Außerdem werden alte Indexes und Constraints aufgeräumt.
--
-- Idempotent: kann mehrfach laufen.
-- ============================================================

-- ── 1. Sicherstellen dass die Spalte author_id existiert ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='reviews' AND column_name='user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='reviews' AND column_name='author_id'
  ) THEN
    ALTER TABLE public.reviews RENAME COLUMN user_id TO author_id;
  END IF;
END $$;

-- comment ggf. nullable machen (war in 055, hier idempotent)
ALTER TABLE public.reviews ALTER COLUMN comment DROP NOT NULL;

-- ── 2. UNIQUE-Constraint auf author_id sicherstellen ─────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname='reviews' AND con.contype='u'
  LOOP
    EXECUTE 'ALTER TABLE public.reviews DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.reviews
  ADD CONSTRAINT uq_reviews_provider_author UNIQUE (service_provider_id, author_id);

CREATE INDEX IF NOT EXISTS idx_reviews_author_id ON public.reviews(author_id);
DROP INDEX IF EXISTS idx_reviews_user_id;  -- aufräumen falls noch da

-- ── 3. submit_review-RPC neu erstellen mit author_id ─────────────────────────
-- Parameter-Name p_user_id bleibt zur Abwärtskompatibilität mit dem
-- iOS-Client (sendet aktuell p_user_id). Intern wird er auf author_id
-- gemappt.
DROP FUNCTION IF EXISTS submit_review(UUID, UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION submit_review(
    p_provider_id UUID,
    p_user_id     UUID,
    p_rating      INTEGER,
    p_comment     TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_review_id     UUID;
    v_avg_rating    DOUBLE PRECISION;
    v_review_count  INTEGER;
BEGIN
    -- Rating-Range validieren
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'rating must be between 1 and 5';
    END IF;

    -- Comment trimmen, leeren String → NULL (Spalte ist jetzt nullable)
    p_comment := NULLIF(TRIM(COALESCE(p_comment, '')), '');

    INSERT INTO public.reviews (service_provider_id, author_id, rating, comment, is_approved, updated_at)
    VALUES (p_provider_id, p_user_id, p_rating, p_comment, true, now())
    ON CONFLICT (service_provider_id, author_id)
    DO UPDATE SET
        rating     = EXCLUDED.rating,
        comment    = EXCLUDED.comment,
        updated_at = now()
    RETURNING id INTO v_review_id;

    -- Average + Count nur über genehmigte Reviews
    SELECT
        ROUND(AVG(r.rating)::numeric, 1)::double precision,
        COUNT(*)::integer
    INTO v_avg_rating, v_review_count
    FROM public.reviews r
    WHERE r.service_provider_id = p_provider_id
      AND r.is_approved = true;

    UPDATE public.service_providers
    SET rating       = COALESCE(v_avg_rating, 0),
        review_count = COALESCE(v_review_count, 0)
    WHERE id = p_provider_id;

    RETURN json_build_object(
        'review_id',    v_review_id,
        'avg_rating',   v_avg_rating,
        'review_count', v_review_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_review(UUID, UUID, INTEGER, TEXT) TO authenticated;

-- ── 4. Schema-Cache neu laden, damit der PostgREST-Client die neue
-- Spalte/Funktion sofort sieht ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── 5. Diagnose-Output ───────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 067 abgeschlossen';
  RAISE NOTICE '   • reviews.author_id sichergestellt';
  RAISE NOTICE '   • UNIQUE(service_provider_id, author_id) gesetzt';
  RAISE NOTICE '   • submit_review-RPC schreibt jetzt in author_id';
END $$;
