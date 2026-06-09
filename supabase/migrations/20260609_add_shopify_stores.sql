-- =====================================================================
--  MIGRATION — Table shopify_stores (boutiques Shopify connectées)
--  Date : 2026-06-09
--
--  Stocke chaque boutique Shopify qui installe l'app : domaine, token
--  d'accès Admin API (chiffré), scopes accordés, et la source de
--  facturation (direct vs shopify) pour éviter la double-facturation.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shopify_stores (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Lien vers le compte app (NULL tant que la boutique n'est pas associée à un user)
  user_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Identité boutique
  shop_domain    TEXT NOT NULL UNIQUE,          -- ex: xeyo-dev.myshopify.com
  access_token   TEXT,                          -- token Admin API (chiffré)
  scopes         TEXT,                          -- scopes accordés (séparés par virgule)
  -- Infos boutique (remplies à la 1re synchro)
  shop_name      TEXT,
  shop_email     TEXT,
  currency       TEXT,
  country        TEXT,
  -- Facturation / réconciliation
  billing_source TEXT NOT NULL DEFAULT 'shopify',  -- 'shopify' | 'direct'
  -- État
  is_active      BOOLEAN NOT NULL DEFAULT true,    -- false après uninstall
  installed_at   TIMESTAMPTZ DEFAULT now(),
  uninstalled_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_stores_user ON shopify_stores(user_id);

-- RLS : l'utilisateur voit sa boutique ; le service_role (OAuth/webhooks) a tout accès.
ALTER TABLE shopify_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON shopify_stores FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "service_all" ON shopify_stores FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
