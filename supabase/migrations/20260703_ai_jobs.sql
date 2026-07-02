-- =====================================================================
--  MIGRATION — File d'attente des réponses IA (backpressure)
--  Date : 2026-07-03
--
--  À l'arrivée d'un message WhatsApp, la réponse IA est normalement générée
--  inline (rapide). En pic (sémaphore global plein), on enfile ici au lieu de
--  saturer le VPS : un cron (run-ai-jobs) draine la file par lots parallèles.
--  Zéro perte (persistant, survit aux redéploiements), dédup sur wa_message_id.
--
--  Calque le pattern éprouvé automation_jobs (20260612_automations.sql).
--  AUCUN secret waba stocké : processAIResponse re-fetch la session par
--  session_id → la table ne contient que des IDs + le contexte minimal.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,   -- RLS owner_read
  agent_id        UUID NOT NULL,                                    -- convFresh.ai_agent_id
  contact_phone   TEXT NOT NULL,                                    -- msg.from (E.164)
  instance_name   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  attempts        SMALLINT NOT NULL DEFAULT 0,      -- garde-fou anti-boucle (max 3)
  result          TEXT,                             -- détail erreur / null si OK
  dedup_key       TEXT,                             -- = wa_message_id (idempotence)
  created_at      TIMESTAMPTZ DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

-- Jobs dus, ordre FIFO (mirror idx_automation_jobs_due). Pas de scheduled_at :
-- un ai_job est toujours dû immédiatement → on ordonne par created_at.
CREATE INDEX IF NOT EXISTS idx_ai_jobs_due
  ON ai_jobs(status, created_at) WHERE status = 'pending';

-- Idempotence : 1 seul job par message entrant. wa_message_id est unique chez
-- Meta → dedup global (pas scopé à un parent, contrairement à automation_jobs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_jobs_dedup
  ON ai_jobs(dedup_key) WHERE dedup_key IS NOT NULL;

-- RLS : propriétaire en lecture uniquement (le cron/webhook passent par service_role)
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read" ON ai_jobs FOR SELECT
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "service_all_ai_jobs" ON ai_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
