-- =====================================================================
--  ACHATS PONCTUELS SHOPIFY (packs de tokens / de conversations IA)
--  2026-07-15
--
--  ── POURQUOI CETTE TABLE EST INDISPENSABLE ──────────────────────────
--
--  `appPurchaseOneTimeCreate` (Shopify Billing) n'a AUCUN champ de métadonnées :
--  on ne peut pas y attacher « ce marchand achète le pack tokens ». Shopify nous
--  renvoie seulement un identifiant de charge et un statut.
--
--  Le pack acheté doit donc vivre CHEZ NOUS, sinon on ne saurait pas quoi
--  créditer au retour du marchand.
--
--  ⚠️ Et surtout : il ne doit PAS voyager dans l'URL de retour.
--  Un `?pack=tokens` serait manipulable — il suffirait de le changer en
--  `?pack=ai_credits`, ou de rejouer l'URL, pour se créditer gratuitement. On
--  ne met donc dans l'URL qu'un identifiant interne opaque, et on relit tout
--  depuis cette table.
--
--  ── L'IDEMPOTENCE ───────────────────────────────────────────────────
--
--  `status` sert de verrou optimiste. Le crédit se fait par :
--
--      UPDATE ... SET status='credited' WHERE id=? AND status='pending'
--
--  Si 0 ligne est touchée, c'est qu'un autre appel a déjà crédité (double-clic,
--  rafraîchissement, retry) → on sort sans rien faire. Sans ça, le marchand
--  serait crédité plusieurs fois pour un seul paiement.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shopify_one_time_purchases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shop_domain   TEXT NOT NULL,

  -- Ce que le marchand a acheté. La quantité et le prix sont définis côté code
  -- (ONE_TIME_PACKS) : on ne fait jamais confiance à ce qui remonte du client.
  pack          TEXT NOT NULL CHECK (pack IN ('tokens','ai_credits')),

  -- L'identifiant Shopify de la charge (gid://shopify/AppPurchaseOneTime/...).
  -- UNIQUE : une charge ne peut créditer qu'une fois, même si Shopify la rejoue.
  charge_id     TEXT UNIQUE,

  --  pending  → créée, le marchand n'a pas (encore) approuvé
  --  credited → approuvée ET créditée (état final)
  --  declined → refusée / expirée (Shopify annule sous 48 h sans approbation)
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','credited','declined')),

  -- Ce qui a réellement été crédité (traçabilité : le pack peut évoluer).
  amount_credited INTEGER,
  price_cents     INTEGER,

  credited_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_time_user   ON shopify_one_time_purchases (user_id, status);
CREATE INDEX IF NOT EXISTS idx_one_time_charge ON shopify_one_time_purchases (charge_id);

-- Le marchand peut consulter ses achats (historique de facturation).
ALTER TABLE shopify_one_time_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS one_time_owner_read ON shopify_one_time_purchases;
CREATE POLICY one_time_owner_read ON shopify_one_time_purchases
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ⚠️ Aucune écriture côté client : le statut ne doit jamais pouvoir passer à
-- 'credited' autrement que par le serveur, après vérification auprès de Shopify.

COMMIT;

NOTIFY pgrst, 'reload schema';
