-- =====================================================================
--  MIGRATION — Suivi de livraison des messages sortants (Phase 2 perf)
--  Date : 2026-07-12
--
--  Objectif : funnel de livraison RÉEL (Envoyé → Livré → Lu → Échec) pour les
--  messages sortants d'automatisation/campagne. On rattache les accusés de
--  réception Meta au message via wa_message_id (désormais stocké à l'envoi).
-- =====================================================================

BEGIN;

-- Horodatages d'étape (on avait déjà read_at). NULL tant que l'accusé n'est pas
-- reçu de Meta.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
-- Raison d'échec de livraison (statut Meta 'failed').
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Rattachement léger message → automatisation / campagne, pour agréger le funnel
-- de livraison PAR campagne. Rempli à l'envoi (dispatch/executor).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS automation_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS campaign_id   UUID;

-- Le match des accusés se fait sur wa_message_id : index indispensable.
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON messages (wa_message_id);
-- Agrégations de perf par automatisation/campagne.
CREATE INDEX IF NOT EXISTS idx_messages_automation ON messages (automation_id) WHERE automation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_campaign   ON messages (campaign_id)   WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN messages.sent_at       IS 'Accusé Meta "sent" (envoyé aux serveurs WhatsApp).';
COMMENT ON COLUMN messages.delivered_at  IS 'Accusé Meta "delivered" (remis sur l''appareil du destinataire).';
COMMENT ON COLUMN messages.error_message IS 'Raison d''échec de livraison (statut Meta "failed").';
COMMENT ON COLUMN messages.automation_id IS 'Automatisation à l''origine du message sortant (perf par auto).';
COMMENT ON COLUMN messages.campaign_id   IS 'Campagne à l''origine du message sortant (perf par campagne).';

COMMIT;

-- Recharge le cache de schéma PostgREST (sinon l''API ne voit pas les colonnes).
NOTIFY pgrst, 'reload schema';
