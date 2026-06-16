-- =====================================================================
--  MIGRATION — Contexte boutique injecté aux agents IA
--  Date : 2026-06-16
--
--  store_context : { name, currency, country, links: { returns, privacy,
--  terms, shipping, ...pages } } — rempli à la synchro, injecté dans le
--  prompt de TOUS les agents pour qu'ils connaissent la boutique et puissent
--  partager les bons liens (politique de retour, FAQ, etc.).
-- =====================================================================

BEGIN;

ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS store_context JSONB;

COMMIT;
