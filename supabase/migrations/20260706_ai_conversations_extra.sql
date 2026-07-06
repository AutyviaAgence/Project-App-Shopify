-- =====================================================================
--  MIGRATION — Crédits IA supplémentaires achetés (conversations)
--  Date : 2026-07-06
--
--  Le bouton « Recharger » vend des packs de conversations IA en plus du quota
--  mensuel du plan. Ces crédits NE PÉRIMENT PAS (contrairement au quota inclus
--  qui se reset chaque mois). On les stocke ici et on les ajoute à la limite
--  dans checkConversationQuota. Décrémenté au fur et à mesure de la conso qui
--  dépasse le quota inclus.
-- =====================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_conversations_extra INTEGER NOT NULL DEFAULT 0;

COMMIT;
