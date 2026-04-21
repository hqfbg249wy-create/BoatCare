-- =============================================================================
-- 042_ai_chat_history.sql
-- AI-Assistent: Historie + Feedback-Loop
--
-- Ziel: Der Skipily Boots-Assistent legt Gespraeche persistent ab, fragt pro
-- Assistentenantwort Feedback ab und nutzt positiv bewertete Antworten in
-- Zukunft als Few-Shot-Kontext.
--
-- Tabellen:
--   ai_chat_sessions   - ein Eintrag pro Gespraech
--   ai_chat_messages   - einzelne Nachrichten (user / assistant)
--   ai_chat_feedback   - Bewertung pro Assistenten-Nachricht
--
-- Alle Tabellen sind RLS-geschuetzt: Nutzer sehen nur eigene Daten.
-- Service-Role (Edge Function) darf alle Feedback-Eintraege lesen,
-- um Top-Antworten als Lernkontext auszulesen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Neues Gespraech',
  boat_context_snapshot JSONB,           -- eingefrorener Boots-Kontext zum Session-Start
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user
  ON ai_chat_sessions(user_id, updated_at DESC);

ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chat sessions"
  ON ai_chat_sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own chat sessions"
  ON ai_chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own chat sessions"
  ON ai_chat_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own chat sessions"
  ON ai_chat_sessions FOR DELETE USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 2) Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session
  ON ai_chat_messages(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user
  ON ai_chat_messages(user_id);

ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chat messages"
  ON ai_chat_messages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own chat messages"
  ON ai_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own chat messages"
  ON ai_chat_messages FOR DELETE USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 3) Feedback
-- -----------------------------------------------------------------------------
-- rating: thumbs_up / thumbs_down
-- outcome: solved / partial / not_solved (nullable - Nutzer muss nicht beides geben)
CREATE TABLE IF NOT EXISTS ai_chat_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES ai_chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('thumbs_up', 'thumbs_down')),
  outcome TEXT CHECK (outcome IN ('solved', 'partial', 'not_solved')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)            -- max. ein Feedback pro Nutzer pro Nachricht
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_feedback_message
  ON ai_chat_feedback(message_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_feedback_rating
  ON ai_chat_feedback(rating, created_at DESC);

ALTER TABLE ai_chat_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own feedback"
  ON ai_chat_feedback FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own feedback"
  ON ai_chat_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own feedback"
  ON ai_chat_feedback FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own feedback"
  ON ai_chat_feedback FOR DELETE USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 4) View: Top-bewertete Antworten als Lernkontext fuer die Edge Function
-- -----------------------------------------------------------------------------
-- Die Edge Function nutzt die Service-Role und umgeht RLS - liefert die
-- letzte User-Frage + zugehoerige Assistentenantwort fuer alle Nachrichten
-- mit thumbs_up und outcome='solved'.
CREATE OR REPLACE VIEW ai_chat_top_answers AS
SELECT
  f.id           AS feedback_id,
  f.rating,
  f.outcome,
  f.created_at   AS feedback_at,
  m_asst.id      AS assistant_message_id,
  m_asst.content AS assistant_content,
  (
    SELECT content FROM ai_chat_messages m_prev
    WHERE m_prev.session_id = m_asst.session_id
      AND m_prev.created_at < m_asst.created_at
      AND m_prev.role = 'user'
    ORDER BY m_prev.created_at DESC
    LIMIT 1
  ) AS user_question
FROM ai_chat_feedback f
JOIN ai_chat_messages m_asst ON m_asst.id = f.message_id
WHERE f.rating = 'thumbs_up'
  AND (f.outcome IS NULL OR f.outcome IN ('solved', 'partial'))
  AND m_asst.role = 'assistant';

-- View mit SECURITY DEFINER-Verhalten ist nicht noetig - Edge Function
-- verwendet ohnehin Service-Role-Key und umgeht RLS.


-- -----------------------------------------------------------------------------
-- 5) Trigger: updated_at auf Sessions automatisch pflegen
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_chat_touch_session()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_chat_sessions
     SET updated_at = now()
   WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_chat_touch_session ON ai_chat_messages;
CREATE TRIGGER trg_ai_chat_touch_session
AFTER INSERT ON ai_chat_messages
FOR EACH ROW
EXECUTE FUNCTION ai_chat_touch_session();
