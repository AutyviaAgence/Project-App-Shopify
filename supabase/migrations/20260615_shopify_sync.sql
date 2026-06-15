-- =====================================================================
--  MIGRATION — Synchro RAG événementielle de la boutique Shopify
--  Date : 2026-06-15
--
--  Permet de rafraîchir la base de connaissances (catalogue / pages /
--  politiques) quand la boutique change, sans dupliquer les documents et
--  sans re-générer les embeddings si le contenu est identique (hash).
--
--  last_synced_at     : dernière synchro complète (pages + politiques + catalogue)
--  catalog_synced_at  : dernière synchro du catalogue (debounce des webhooks produits)
--  last_sync_summary  : { products, pages, policies, at } — lu par le statut dashboard
--  *_doc_id           : réfs stables des 3 documents knowledge (pas de FK : le code
--                       recrée le doc s'il a disparu)
--  content_hashes     : { catalog, pages, policies } — empreinte du dernier contenu
--                       ingéré, pour sauter le re-embedding si rien n'a changé
-- =====================================================================

BEGIN;

ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS last_synced_at    TIMESTAMPTZ;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS catalog_synced_at TIMESTAMPTZ;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS last_sync_summary JSONB;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS catalog_doc_id    UUID;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS pages_doc_id      UUID;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS policies_doc_id   UUID;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS content_hashes    JSONB;

-- Backfill best-effort des doc-ids pour les boutiques déjà connectées
-- (par le nom de document actuel "Catalogue — {shop}", etc.).
UPDATE shopify_stores s SET catalog_doc_id = d.id
  FROM knowledge_documents d
  WHERE s.catalog_doc_id IS NULL AND d.user_id = s.user_id
    AND d.name = 'Catalogue — ' || COALESCE(s.shop_name, s.shop_domain);
UPDATE shopify_stores s SET pages_doc_id = d.id
  FROM knowledge_documents d
  WHERE s.pages_doc_id IS NULL AND d.user_id = s.user_id
    AND d.name = 'Pages — ' || COALESCE(s.shop_name, s.shop_domain);
UPDATE shopify_stores s SET policies_doc_id = d.id
  FROM knowledge_documents d
  WHERE s.policies_doc_id IS NULL AND d.user_id = s.user_id
    AND d.name = 'Politiques — ' || COALESCE(s.shop_name, s.shop_domain);

COMMIT;
