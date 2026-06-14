-- =====================================================================
--  MIGRATION — Templates liés au cycle de vie de la session WABA
--  Date : 2026-06-14
--
--  Un modèle WhatsApp appartient à un compte WhatsApp Business (une session).
--  Quand on supprime la session, ses modèles doivent disparaître (ils ne sont
--  plus envoyables). On passe donc la FK session_id de SET NULL à CASCADE.
--
--  On rattache aussi les modèles orphelins (session_id NULL) à la session
--  connectée de l'utilisateur, s'il en a une seule — pour ne pas les perdre.
-- =====================================================================

BEGIN;

-- 1. Rattacher les modèles orphelins à l'unique session connectée de l'user
--    (si l'user a exactement une session connectée).
UPDATE whatsapp_templates t
SET session_id = s.id
FROM (
  SELECT user_id, (array_agg(id))[1] AS id
  FROM whatsapp_sessions
  WHERE status = 'connected'
  GROUP BY user_id
  HAVING COUNT(*) = 1
) s
WHERE t.user_id = s.user_id AND t.session_id IS NULL;

-- 2. Recréer la FK en ON DELETE CASCADE.
ALTER TABLE whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_session_id_fkey;
ALTER TABLE whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE CASCADE;

COMMIT;
