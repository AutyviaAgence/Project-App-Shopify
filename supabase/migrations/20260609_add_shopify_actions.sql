-- =====================================================================
--  MIGRATION — Table shopify_actions (actions Shopify à valider)
--  Date : 2026-06-09
--
--  L'agent IA ne modifie JAMAIS la boutique directement. Quand un client
--  demande une action sensible (annulation, remboursement, code promo),
--  l'IA crée une action "pending" ici. Un humain la valide depuis Xeyo ;
--  seulement à ce moment l'action est exécutée via l'Admin API Shopify.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shopify_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  -- Type d'action
  action_type     TEXT NOT NULL,        -- 'cancel_order' | 'refund_order' | 'create_discount'
  -- Détails de l'action (payload structuré : n° commande, montant, code…)
  payload         JSONB NOT NULL,
  -- Résumé lisible (affiché à l'humain qui valide)
  summary         TEXT,
  -- Cycle de vie
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | rejected | executed | failed
  result          JSONB,                -- résultat de l'exécution Shopify
  error_message   TEXT,
  reviewed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  executed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_actions_user_status ON shopify_actions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_shopify_actions_conversation ON shopify_actions(conversation_id);

-- RLS user-only + service_role (création par l'IA via webhook)
ALTER TABLE shopify_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON shopify_actions FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "service_all" ON shopify_actions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
