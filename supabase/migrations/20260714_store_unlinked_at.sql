-- Déliaison VOLONTAIRE d'une boutique Shopify de son compte Xeyo.
--
-- ⚠️ LE PROBLÈME QUE ÇA RÉSOUT.
--
-- Le bouton « déconnecter la boutique » remet `user_id` à NULL (on ne SUPPRIME pas
-- la ligne : avec le managed install, `ensureStoreProvisioned` la recréerait
-- aussitôt et la déconnexion serait sans effet).
--
-- Mais une boutique orpheline dont le `shop_email` correspond à l'email du compte
-- est RÉ-ADOPTÉE automatiquement par /api/shopify/store-status — un mécanisme voulu,
-- qui rattache la boutique à son marchand après une installation. Résultat : le
-- marchand cliquait « déconnecter », et la boutique revenait au chargement suivant.
--
-- `unlinked_at` distingue les deux cas :
--   · NULL           → orpheline « naturelle » (fraîchement installée) → adoptable
--   · horodaté       → le marchand l'a VOLONTAIREMENT déliée → ne pas ré-adopter
--
-- Le champ est remis à NULL dès qu'une liaison explicite a lieu (bouton « Relier à
-- mon compte », /api/shopify/connect) : la boutique redevient adoptable.

alter table public.shopify_stores
  add column if not exists unlinked_at timestamptz;

comment on column public.shopify_stores.unlinked_at is
  'Déliaison volontaire du compte Xeyo. Non NULL = ne pas ré-adopter automatiquement (sinon la déconnexion serait annulée au chargement suivant).';

notify pgrst, 'reload schema';
