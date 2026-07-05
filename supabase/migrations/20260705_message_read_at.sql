-- =====================================================================
--  MIGRATION — Horodatage de lecture des messages (accusés WhatsApp)
--  Date : 2026-07-05
--
--  Le webhook WABA reçoit les statuts sent/delivered/read avec un timestamp
--  (status.timestamp, Unix seconds) mais ne stockait que l'enum `status`.
--  On ajoute `read_at` pour :
--    - alimenter la colonne « vues » de la vue tableau des contacts,
--    - déclencher l'automatisation `message_read` une seule fois (transition
--      sent/delivered → read), en s'appuyant sur read_at IS NULL.
-- =====================================================================

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Recherche des messages lus mais non encore comptés / notifiés.
CREATE INDEX IF NOT EXISTS idx_messages_read_at
  ON messages (read_at)
  WHERE read_at IS NOT NULL;

COMMIT;
