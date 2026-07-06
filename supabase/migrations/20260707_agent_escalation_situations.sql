-- =====================================================================
--  MIGRATION — Situations d'escalade décrites par le marchand (détection IA)
--  Date : 2026-07-07
--
--  Le transfert à un conseiller humain se fait par DÉTECTION IA (plus par
--  mots-clés). Le marchand décrit en langage naturel les situations qui
--  doivent déclencher le transfert ; ce texte est injecté dans le prompt du
--  détecteur. NULL/vide → le détecteur utilise ses règles par défaut.
-- =====================================================================

BEGIN;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS escalation_situations TEXT;

COMMIT;
