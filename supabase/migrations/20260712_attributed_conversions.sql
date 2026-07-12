-- =====================================================================
--  MIGRATION — Attribution du CA aux campagnes / automatisations (Phase 3 perf)
--  Date : 2026-07-12
--
--  Objectif : « X € générés » et ROAS par campagne/automatisation. On relie une
--  commande Shopify au DERNIER message WhatsApp envoyé au contact dans une
--  fenêtre d'attribution (last-touch bornée), avec le montant. Remplace
--  l'attribution booléenne approximative (ab_test_assignments.ordered marqué sur
--  toutes les assignations d'un contact, sans montant ni fenêtre).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS attributed_conversions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  -- Source attribuée (au moins l'une des deux renseignée).
  automation_id    UUID,
  campaign_id      UUID,
  contact_id       UUID,
  -- Commande Shopify (idempotence : 1 attribution par commande).
  shopify_order_id TEXT NOT NULL,
  amount           NUMERIC NOT NULL DEFAULT 0,   -- montant de la commande (devise boutique)
  currency         TEXT,
  -- Message déclencheur de l'attribution (dernier msg envoyé dans la fenêtre).
  message_id       UUID,
  attributed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Délai (heures) entre l'envoi du message et la commande — pour analyse.
  hours_to_order   NUMERIC,
  -- Une commande n'est attribuée qu'UNE fois (au dernier message).
  UNIQUE (user_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_attrconv_automation ON attributed_conversions (automation_id) WHERE automation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attrconv_campaign   ON attributed_conversions (campaign_id)   WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attrconv_user_time  ON attributed_conversions (user_id, attributed_at);

COMMENT ON TABLE attributed_conversions IS
  'CA attribué (last-touch borné) : commande Shopify → dernier message WhatsApp → campagne/automatisation.';

COMMIT;

NOTIFY pgrst, 'reload schema';
