-- =====================================================================
--  MIGRATION — Autoriser message_type 'carousel' et 'interactive'
--  Date : 2026-06-24
--
--  La contrainte CHECK sur messages.message_type n'autorisait que
--  text/image/audio/video/document/sticker/location/contact. Du coup, tracer un
--  carrousel envoyé (message_type='carousel') ou un message interactif/boutons
--  (message_type='interactive') faisait ÉCHOUER l'insert en silence → aucun
--  message dans l'inbox alors que l'envoi WhatsApp réussissait.
--
--  On élargit la liste autorisée.
-- =====================================================================

BEGIN;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'text', 'image', 'audio', 'video', 'document',
    'sticker', 'location', 'contact', 'carousel', 'interactive'
  ]));

COMMIT;
