-- Migration 026: RLS-Policies fuer provider_edit_suggestions fixen
-- Die Tabelle hat "suggested_by" (NOT NULL) als User-ID Spalte, nicht "user_id"
-- Die alten Policies referenzierten "user_id" was nicht existiert

-- 1. ZUERST Policies loeschen (die von user_id abhaengen)
DROP POLICY IF EXISTS "Authenticated users can create suggestions" ON provider_edit_suggestions;
DROP POLICY IF EXISTS "Users can read own suggestions" ON provider_edit_suggestions;

-- 2. DANN versehentlich angelegte user_id Spalte entfernen
ALTER TABLE provider_edit_suggestions
  DROP COLUMN IF EXISTS user_id;

-- 3. Neue Policies mit korrektem Spaltennamen "suggested_by"
CREATE POLICY "Authenticated users can create suggestions"
ON provider_edit_suggestions FOR INSERT
WITH CHECK (auth.uid() = suggested_by);

CREATE POLICY "Users can read own suggestions"
ON provider_edit_suggestions FOR SELECT
USING (auth.uid() = suggested_by);

-- 4. PostgREST Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
