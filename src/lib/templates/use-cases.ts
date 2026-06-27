/**
 * Catégories e-commerce des templates WhatsApp (use_case).
 *
 * On présente au marchand des catégories par USAGE (états de commande, panier,
 * marketing, support, paiement) au lieu de la catégorie technique Meta
 * (UTILITY/MARKETING/AUTHENTICATION). Chaque use_case mappe vers la catégorie
 * Meta par défaut, nécessaire à la soumission.
 */

export type UseCaseKey = 'order_status' | 'cart' | 'marketing' | 'support' | 'billing'

export type MetaCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export type UseCase = {
  key: UseCaseKey
  label: string
  /** nom d'icône lucide-react (résolu côté composant) */
  icon: string
  description: string
  /** catégorie Meta appliquée par défaut quand on choisit ce use_case */
  metaCategory: MetaCategory
}

export const USE_CASES: UseCase[] = [
  {
    key: 'order_status',
    label: 'États de commande',
    icon: 'Package',
    description: 'Confirmation, expédition, livraison, annulation…',
    metaCategory: 'UTILITY',
  },
  {
    key: 'cart',
    label: 'Panier & relance',
    icon: 'ShoppingCart',
    description: 'Panier abandonné, relance, récupération…',
    metaCategory: 'MARKETING',
  },
  {
    key: 'marketing',
    label: 'Marketing & promos',
    icon: 'Megaphone',
    description: 'Offres, nouveautés, codes promo, newsletters…',
    metaCategory: 'MARKETING',
  },
  {
    key: 'support',
    label: 'Support & SAV',
    icon: 'MessageCircle',
    description: 'Bienvenue, demande d\'avis, retours, satisfaction…',
    metaCategory: 'UTILITY',
  },
  {
    key: 'billing',
    label: 'Paiement & facturation',
    icon: 'CreditCard',
    description: 'Paiement reçu, remboursement, relance paiement…',
    metaCategory: 'UTILITY',
  },
]

export const USE_CASE_BY_KEY: Record<string, UseCase> = Object.fromEntries(
  USE_CASES.map((u) => [u.key, u])
)

/**
 * Devine la catégorie e-commerce d'un template à partir de son nom et de sa
 * catégorie Meta. Aligné sur le backfill SQL de la migration.
 */
export function guessUseCase(name: string, metaCategory?: string | null): UseCaseKey {
  const n = (name || '').toLowerCase()
  if (/panier|abandon|cart/.test(n)) return 'cart'
  if (/rembours|paiement|facture|refund|billing/.test(n)) return 'billing'
  if (/commande|expedi|livr|annul|shipped|delivered|order/.test(n)) return 'order_status'
  if (/retour|avis|bienvenue|support|sav|return|review|welcome/.test(n)) return 'support'
  if (/promo|offre|anniversaire|marketing|newsletter|birthday/.test(n)) return 'marketing'
  // Repli sur la catégorie Meta.
  return metaCategory === 'MARKETING' ? 'marketing' : 'support'
}
