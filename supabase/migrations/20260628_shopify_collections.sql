-- =====================================================================
--  MIGRATION — Collections Shopify structurées
--  Date : 2026-06-28
--
--  Pour proposer « Collection contient » en liste déroulante dans les
--  conditions d'automatisation (au lieu d'une saisie libre), on stocke les
--  collections de la boutique. Rempli à la synchro Shopify.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shopify_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  shopify_id  TEXT NOT NULL,              -- gid Shopify
  title       TEXT NOT NULL,
  handle      TEXT,
  position    INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_id, shopify_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_collections_user ON shopify_collections (user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_collections_store ON shopify_collections (store_id);

-- Collections d'un produit (titres) — pour évaluer « Collection contient » sur
-- une commande : on retrouve les produits commandés puis leurs collections.
ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS collections TEXT[];

COMMIT;
