-- =====================================================================
--  MIGRATION — Visual Builder : graphe de nœuds pour les automatisations
--  Date : 2026-06-12
--
--  Passe d'une automatisation linéaire (event+delay+1 template) à un GRAPHE
--  de nœuds (trigger → delay → condition → actions, avec branches Oui/Non).
--  Le graphe est stocké en JSONB ; l'ancien format linéaire reste valide
--  (graph NULL = on retombe sur trigger_event/template_id/delay_minutes).
--
--  Le format JSON est conçu pour être généré/lu par l'IA :
--    { "nodes": [...], "edges": [...] }
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS graph JSONB,
  -- Pour le moteur : node courant lors de l'exécution d'un job (cf automation_jobs)
  ADD COLUMN IF NOT EXISTS builder_mode BOOLEAN NOT NULL DEFAULT false;

-- Les jobs traversent le graphe nœud par nœud : on mémorise le nœud à exécuter.
ALTER TABLE automation_jobs
  ADD COLUMN IF NOT EXISTS current_node_id TEXT;

COMMIT;
