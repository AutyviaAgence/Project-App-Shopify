-- =====================================================================
--  MIGRATION — Pays de la commande Shopify
--  Date : 2026-06-29
--
--  Pour placer des marqueurs sur le globe (d'où viennent les ventes), on
--  stocke le code pays (ISO-2) de l'adresse de livraison de la commande.
-- =====================================================================

BEGIN;

ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS country TEXT;  -- code ISO-2 (FR, US, ...)

COMMIT;
