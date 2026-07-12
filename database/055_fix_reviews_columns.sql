-- Migration 055: Reviews-Tabelle für App-Kompatibilität reparieren
-- Probleme:
--   1. Spalte heißt user_id, Code erwartet author_id → umbenennen
--   2. comment ist NOT NULL, Code sendet null für reine Sternebewertungen → nullable machen
--   3. is_approved, is_reported noch nicht vorhanden (für KI-Moderation)
--   4. RLS-Policies auf author_id anpassen

-- ── 1. user_id → author_id umbenennen ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'author_id'
  ) THEN
    ALTER TABLE public.reviews RENAME COLUMN user_id TO author_id;
  END IF;
END $$;

-- ── 2. comment nullable machen ────────────────────────────────────────────────
ALTER TABLE public.reviews ALTER COLUMN comment DROP NOT NULL;

-- ── 3. Moderations-Spalten hinzufügen ────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_approved  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_reported  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- ── 4. Unique-Constraint auf neuen Spaltennamen aktualisieren ─────────────────
-- (Falls noch auf user_id basierend, würde er nach dem Rename sowieso gelten,
--  aber sicherheitshalber neu anlegen)
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS uq_reviews_provider_user;
ALTER TABLE public.reviews
  ADD CONSTRAINT uq_reviews_provider_user UNIQUE (service_provider_id, author_id);

-- ── 5. Index auf author_id anlegen (alter idx_reviews_user_id bleibt ggf.) ────
CREATE INDEX IF NOT EXISTS idx_reviews_author_id ON public.reviews(author_id);

-- ── 6. RLS-Policies auf author_id anpassen ───────────────────────────────────
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public" ON public.reviews
  FOR SELECT USING (
    is_approved = true
    OR auth.uid() = author_id  -- Eigene noch nicht genehmigte Bewertung sichtbar
  );

DROP POLICY IF EXISTS "reviews_insert_own" ON public.reviews;
CREATE POLICY "reviews_insert_own" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "reviews_update_own" ON public.reviews;
CREATE POLICY "reviews_update_own" ON public.reviews
  FOR UPDATE USING  (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "reviews_delete_own" ON public.reviews;
CREATE POLICY "reviews_delete_own" ON public.reviews
  FOR DELETE USING (auth.uid() = author_id);

-- Admin-Policy (aus Migration 054, idempotent wiederholen)
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.reviews;
CREATE POLICY "Admins can manage all reviews" ON public.reviews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'admin_readonly')
    )
  );

-- ── 7. Ergebnis prüfen ────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'reviews' AND table_schema = 'public'
ORDER BY ordinal_position;
