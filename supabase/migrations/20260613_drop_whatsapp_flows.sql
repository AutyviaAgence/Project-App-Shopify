-- =====================================================================
--  MIGRATION — Suppression des WhatsApp Flows
--  Date : 2026-06-13
--
--  Fonctionnalité retirée : l'agent IA conversationnel gère le SAV de façon
--  plus naturelle qu'un formulaire statique. On supprime la table dédiée.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS whatsapp_flows CASCADE;

COMMIT;
