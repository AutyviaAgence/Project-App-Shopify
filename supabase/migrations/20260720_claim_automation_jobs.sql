-- Réservation ATOMIQUE des jobs d'automatisation.
--
-- ⚠️ LE PROBLÈME : DOUBLE ENVOI CHEZ DE VRAIS CLIENTS.
--
-- Le cron sélectionnait les jobs `pending` dus, puis les traitait, puis les
-- marquait en fin de parcours. Entre les deux, rien ne les réservait. Or le
-- tick tourne toutes les minutes et un lot de 500 jobs (un carrousel = download
-- Shopify + upload Meta) peut dépasser 60 s : le tick suivant démarrait alors
-- que le précédent envoyait encore, et reprenait EXACTEMENT les mêmes jobs.
-- Le client recevait le message deux fois — et la note de qualité du numéro
-- Meta en pâtit.
--
-- `dedup_key` ne protège que la CRÉATION du job, pas son exécution.
--
-- `FOR UPDATE SKIP LOCKED` est le mécanisme prévu par Postgres pour ça : chaque
-- appel verrouille les lignes qu'il prend et IGNORE celles déjà verrouillées
-- par une autre transaction. Deux ticks concurrents obtiennent donc deux lots
-- disjoints, sans attente ni conflit.
CREATE OR REPLACE FUNCTION claim_automation_jobs(p_limit INT DEFAULT 500)
RETURNS SETOF automation_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE automation_jobs
  SET status = 'processing',
      claimed_at = now()
  WHERE id IN (
    SELECT id
    FROM automation_jobs
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Quand la réservation a eu lieu : sert à détecter les jobs abandonnés.
ALTER TABLE automation_jobs
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- ── FILET : les jobs abandonnés doivent repartir ──────────────────────────
--
-- Si le processus meurt entre la réservation et l'envoi (redéploiement, OOM,
-- timeout), le job reste `processing` pour toujours : plus personne ne le
-- reprend, et le client n'a jamais son message.
--
-- On les remet donc en file au-delà de 10 minutes — largement plus que la durée
-- d'un tick (60 s), donc aucun risque de doubler un job encore en cours.
CREATE OR REPLACE FUNCTION requeue_stale_automation_jobs()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  n INT;
BEGIN
  UPDATE automation_jobs
  SET status = 'pending',
      claimed_at = NULL
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - INTERVAL '10 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Accélère la sélection des jobs dus et le balayage des jobs abandonnés.
CREATE INDEX IF NOT EXISTS idx_automation_jobs_claim
  ON automation_jobs (status, scheduled_at)
  WHERE status IN ('pending', 'processing');

NOTIFY pgrst, 'reload schema';
