-- =====================================================================
--  MIGRATION — Refonte campagnes (templates Meta + déclencheurs auto)
--  Date : 2026-06-10
--
--  Les campagnes n'utilisent plus l'agent IA : hors fenêtre 24h, Meta
--  n'accepte QUE des templates approuvés. On ajoute :
--    - template_id  : le template WhatsApp approuvé à envoyer
--    - campaign_mode: manual | auto
--    - trigger_type : inactivity | shopify_event | scheduled | tag
--    - trigger_event: pour shopify_event (ex: order_fulfilled), ou détail
--    - template_params : mapping des variables du template (JSON)
--
--  Les colonnes relance_agent_id / conversation_agent_id sont conservées
--  (compat) mais ne seront plus utilisées par la nouvelle logique.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_params JSONB;            -- variables à injecter dans le template
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_mode TEXT NOT NULL DEFAULT 'manual';  -- manual | auto
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS trigger_type TEXT;               -- inactivity | shopify_event | scheduled | tag
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS trigger_event TEXT;              -- ex: 'order_fulfilled' pour shopify_event
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false; -- pour les campagnes auto (on/off)

CREATE INDEX IF NOT EXISTS idx_campaigns_auto ON campaigns(campaign_mode, is_active) WHERE campaign_mode = 'auto';

COMMIT;
