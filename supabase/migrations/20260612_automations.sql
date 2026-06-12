-- =====================================================================
--  MIGRATION — Moteur d'automatisations (event → délai → conditions → template)
--  Date : 2026-06-12
--
--  Permet de brancher un template WhatsApp sur un événement Shopify, avec un
--  délai (variable de temps), une fenêtre horaire et des conditions métier.
--
--    automations       : les règles (1 règle = 1 événement + 1 template + timing)
--    automation_jobs    : la file d'envois programmés (1 par contact/événement),
--                         dépilée par le cron quand scheduled_at est atteint.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS automations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- Déclencheur
  trigger_event TEXT NOT NULL,        -- order_created | order_paid | order_fulfilled
                                       -- | order_cancelled | refund_created | checkout_abandoned
  template_id   UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  -- Timing
  delay_minutes INTEGER NOT NULL DEFAULT 0,   -- délai après l'événement (0 = immédiat)
  quiet_start   SMALLINT,             -- heure (0-23) début "ne pas envoyer", null = désactivé
  quiet_end     SMALLINT,             -- heure (0-23) fin "ne pas envoyer"
  timezone      TEXT NOT NULL DEFAULT 'Europe/Paris',
  -- Conditions (JSON) : { min_total, max_total, first_order_only, ... }
  conditions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_user ON automations(user_id);
CREATE INDEX IF NOT EXISTS idx_automations_active_event
  ON automations(trigger_event, is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS automation_jobs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id  UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES contacts(id) ON DELETE CASCADE,
  -- Données de l'événement (contexte de variables : order_number, total…)
  event_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at   TIMESTAMPTZ NOT NULL,           -- quand l'envoi devient dû
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | sent | skipped | failed
  result         TEXT,                            -- détail (raison du skip / erreur)
  -- Idempotence : 1 seul job par (automation, événement-source)
  dedup_key      TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  processed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
  ON automation_jobs(status, scheduled_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_jobs_dedup
  ON automation_jobs(automation_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- RLS : propriétaire uniquement (le cron/webhooks passent par service_role)
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON automations FOR ALL
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "service_all" ON automations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "owner_read" ON automation_jobs FOR SELECT
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "service_all_jobs" ON automation_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
