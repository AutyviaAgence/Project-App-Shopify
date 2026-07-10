-- FUNNEL À BOUTONS (campagnes marketing) : un message à boutons parque le job
-- (automation_jobs.status = 'waiting') jusqu'au clic du client, puis le webhook
-- le reprend sur la bonne branche.
--
-- automation_jobs.status est une colonne TEXT libre (pas de CHECK), donc la
-- valeur 'waiting' ne nécessite aucun ALTER — seul l'index accélère la
-- recherche du job parqué d'un contact au moment du clic.
CREATE INDEX IF NOT EXISTS automation_jobs_contact_waiting_idx
  ON automation_jobs (contact_id, status);

-- Stats de branche : quel bouton le contact a cliqué (button:<libellé>).
-- Sur la table d'assignations d'engagement déjà existante.
ALTER TABLE ab_test_assignments
  ADD COLUMN IF NOT EXISTS clicked_branch TEXT;

-- ⚠️ Après application directe en prod : NOTIFY pgrst, 'reload schema';
