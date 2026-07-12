-- DIAGNOSE (nur lesen): Wohin laufen die letzten Nachrichten?
-- Zeigt je Nachricht die Konversation, den Provider und ob dieser Provider
-- einem Provider-Account gehört (sp.user_id). Ist sp.user_id NULL, kann KEIN
-- Provider-Portal die Nachricht sehen (Provider nicht beansprucht).

SELECT
  m.created_at,
  m.sender_type,
  left(m.content, 40)        AS content,
  m.conversation_id,
  c.provider_id,
  sp.name                    AS provider_name,
  sp.user_id                 AS provider_account,   -- NULL => nicht beansprucht
  c.user_id                  AS owner_id
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
LEFT JOIN public.service_providers sp ON sp.id = c.provider_id
ORDER BY m.created_at DESC
LIMIT 15;
