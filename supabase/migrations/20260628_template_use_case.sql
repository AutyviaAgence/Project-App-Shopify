-- =====================================================================
--  MIGRATION — Catégorie e-commerce (use_case) sur les templates
--  Date : 2026-06-28
--
--  La page Templates s'organise désormais par USAGE e-commerce (états de
--  commande, panier, marketing, support, paiement) plutôt que par la catégorie
--  technique Meta (UTILITY/MARKETING/AUTHENTICATION). On ajoute une colonne
--  use_case et on backfill les templates existants depuis leur nom.
--
--  Valeurs : 'order_status' | 'cart' | 'marketing' | 'support' | 'billing'
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS use_case TEXT;

-- Backfill par pattern de nom (templates existants).
UPDATE whatsapp_templates SET use_case = CASE
  WHEN name ~* 'panier|abandon|cart'                              THEN 'cart'
  WHEN name ~* 'rembours|paiement|facture|refund|billing'         THEN 'billing'
  WHEN name ~* 'commande|expedi|livr|annul|shipped|delivered|order' THEN 'order_status'
  WHEN name ~* 'retour|avis|bienvenue|support|sav|return|review|welcome' THEN 'support'
  WHEN name ~* 'promo|offre|anniversaire|marketing|newsletter|birthday' THEN 'marketing'
  ELSE NULL
END
WHERE use_case IS NULL;

-- Repli sur la catégorie Meta pour ce qui n'a pas matché.
UPDATE whatsapp_templates SET use_case =
  CASE WHEN category = 'MARKETING' THEN 'marketing' ELSE 'support' END
WHERE use_case IS NULL;

COMMIT;
