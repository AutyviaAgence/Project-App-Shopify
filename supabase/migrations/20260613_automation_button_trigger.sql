-- =====================================================================
--  MIGRATION — Déclencheur "clic sur un bouton" pour les automations
--  Date : 2026-06-13
--
--  Les boutons "réponse rapide" (quick reply) des templates WhatsApp ne
--  renvoient pas de payload personnalisé : Meta renvoie seulement le LIBELLÉ
--  du bouton cliqué. On matche donc l'automation sur ce libellé.
--
--  trigger_button_text : libellé du bouton qui déclenche cette automation
--    (utilisé uniquement quand trigger_event = 'button_clicked'). Comparaison
--    insensible à la casse/espaces côté code. NULL = tout bouton.
-- =====================================================================

BEGIN;

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS trigger_button_text TEXT;

COMMIT;
