-- =====================================================================
--  MIGRATION — État "modifié, à resoumettre" pour les templates
--  Date : 2026-06-13
--
--  Quand on modifie un template DÉJÀ APPROUVÉ sans le re-soumettre, la version
--  approuvée reste active chez Meta (et continue d'être envoyée). On ne doit donc
--  PAS repasser le statut en 'draft' (sinon les envois s'arrêtent). À la place,
--  un drapeau indique qu'il existe des modifications locales non soumises.
--
--  has_pending_changes = true  → l'UI affiche « Modifié — à resoumettre »
--    (le badge "Approuvé" seul serait trompeur). Remis à false à la soumission.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS has_pending_changes BOOLEAN NOT NULL DEFAULT false;

COMMIT;
