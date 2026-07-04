-- =====================================================================
--  MIGRATION — Mode remboursement automatique par agent IA
--  Date : 2026-07-06
--
--  Permet à un agent (OPT-IN, OFF par défaut) de rembourser SEUL selon des
--  règles écrites par le marchand, sous un plafond de montant. Chaque
--  remboursement auto est journalisé + alerté. Le partiel reste possible.
--
--  ⚠️ OFF par défaut : aucun agent existant n'est impacté.
-- =====================================================================

BEGIN;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS refund_auto_enabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_auto_rules      TEXT,
  ADD COLUMN IF NOT EXISTS refund_auto_max_amount NUMERIC(10,2);

COMMIT;
