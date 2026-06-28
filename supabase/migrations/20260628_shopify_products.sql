-- =====================================================================
--  MIGRATION — Produits Shopify structurés
--  Date : 2026-06-28
--
--  Le catalogue était uniquement stocké en texte (doc RAG). Pour générer des
--  carrousels produits et des liens vers de vrais produits dans les templates
--  IA, on stocke chaque produit de façon structurée (titre, handle, URL, image,
--  prix). Rempli à la synchro Shopify (connexion / resync / webhook produits).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shopify_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  shopify_id  TEXT NOT NULL,              -- gid Shopify (identifiant unique produit)
  title       TEXT NOT NULL,
  handle      TEXT,
  url         TEXT,                        -- onlineStoreUrl (URL publique, NULL si non publié)
  image_url   TEXT,                        -- featuredImage.url (CDN Shopify)
  price       TEXT,                        -- prix de la 1re variante (texte, ex "49.90")
  currency    TEXT,
  available   BOOLEAN DEFAULT true,
  position    INTEGER DEFAULT 0,           -- ordre d'apparition dans le catalogue
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_id, shopify_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_user ON shopify_products (user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_store ON shopify_products (store_id);

COMMIT;
