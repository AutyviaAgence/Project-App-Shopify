-- =====================================================================
--  MIGRATION — Commandes Shopify persistées (stats de ventes)
--  Date : 2026-06-29
--
--  Jusqu'ici les commandes n'étaient récupérées qu'en LIVE (par contact,
--  pour le panneau d'une conversation). Aucune donnée de vente n'était
--  stockée → impossible d'agréger un CA mensuel.
--
--  On persiste désormais chaque commande reçue via webhook Shopify
--  (orders/create, orders/paid, ...). On marque celles attribuables à
--  WhatsApp (contact opt-in) pour distinguer le CA total du CA WhatsApp.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shopify_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  store_id          UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,
  -- Identifiant Shopify de la commande (numérique) — unicité par boutique.
  shopify_order_id  TEXT NOT NULL,
  order_number      TEXT,                        -- ex: #1042
  total_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT,
  financial_status  TEXT,                        -- paid / pending / refunded ...
  fulfillment_status TEXT,                       -- fulfilled / unfulfilled ...
  -- Contact Xeyo relié (si trouvé) + attribution WhatsApp.
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  is_whatsapp       BOOLEAN NOT NULL DEFAULT false, -- contact opt-in WhatsApp
  -- Date de la commande côté Shopify (sert à l'agrégation par mois).
  ordered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_user        ON shopify_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_user_date   ON shopify_orders (user_id, ordered_at);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_store       ON shopify_orders (store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_contact     ON shopify_orders (contact_id);

COMMIT;
