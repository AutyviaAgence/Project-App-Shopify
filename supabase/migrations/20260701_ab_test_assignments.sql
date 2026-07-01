-- =====================================================================
--  MIGRATION — Résultats des tests A/B (automatisations)
--  Date : 2026-07-01
--
--  Le nœud "Test A/B" du builder répartit les contacts entre variantes
--  (A/B/C/D). On enregistre ici quelle variante chaque contact a reçue,
--  et si le contact a ensuite RÉPONDU et/ou COMMANDÉ, pour calculer les
--  taux par variante (message gagnant).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ab_test_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  automation_id  UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  node_id        TEXT NOT NULL,                 -- id du nœud ab_test dans le graphe
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  variant_key    TEXT NOT NULL,                 -- A / B / C / D
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded      BOOLEAN NOT NULL DEFAULT false,
  responded_at   TIMESTAMPTZ,
  ordered        BOOLEAN NOT NULL DEFAULT false,
  ordered_at     TIMESTAMPTZ,
  -- Un contact ne reçoit qu'une variante par nœud A/B (idempotence).
  UNIQUE (automation_id, node_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_assign_user       ON ab_test_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_ab_assign_automation ON ab_test_assignments (automation_id, node_id);
CREATE INDEX IF NOT EXISTS idx_ab_assign_contact    ON ab_test_assignments (contact_id);

COMMIT;
