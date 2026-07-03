// =====================================================================
//  GRILLE DE PLANS — SOURCE DE VÉRITÉ UNIQUE
//
//  Fichier partagé client/serveur (aucun import Node). Toute référence à un
//  plan (prix, limites, features, gating IA) doit passer par ce module —
//  stripe/plans.ts et shopify/plans.ts s'alignent dessus.
//
//  Modèle commercial :
//  - free    : 0€   — AUCUNE IA (gestion manuelle + onboarding seulement)
//  - starter : 29€  — ~100 conversations IA / mois (gpt-4o-mini)
//  - pro     : 89€  — ~500 conversations IA / mois
//  - scale   : 249€ — « illimité » fair-use (plafond interne 2000 : ALERTE
//                      sans blocage — on discute d'un sur-mesure au-delà)
//
//  Unité affichée : conversations estimées (1 conversation ≈ 1 contact/mois).
//  Les tokens (PLAN_TOKEN_LIMITS, stripe/plans.ts) restent un backstop
//  anti-abus silencieux, pas la limite commerciale.
// =====================================================================

export type PlanId = 'free' | 'starter' | 'pro' | 'scale'

export type PlanDef = {
  id: PlanId
  name: string
  priceEur: number
  /** false = plan sans IA (webhook muet, routes IA refusées, campagnes off) */
  aiEnabled: boolean
  /** null = illimité (fair-use). 0 = pas d'IA. */
  conversationsPerMonth: number | null
  /** Plafond fair-use (scale) : alerte au-delà, PAS de blocage. */
  fairUseCap?: number
  features: string[]
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    priceEur: 0,
    aiEnabled: false,
    conversationsPerMonth: 0,
    features: [
      'Boîte de réception WhatsApp',
      'Réponses manuelles illimitées',
      'Onboarding assisté',
      'Modèles WhatsApp',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceEur: 29,
    aiEnabled: true,
    conversationsPerMonth: 100,
    features: [
      '~100 conversations IA / mois',
      'Agent IA auto-configuré',
      'Base de connaissances Shopify',
      'Automatisations (panier abandonné…)',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceEur: 89,
    aiEnabled: true,
    conversationsPerMonth: 500,
    features: [
      '~500 conversations IA / mois',
      'Actions Shopify (annulation, remboursement…)',
      'Multi-agents',
      'Analyse lifecycle IA',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    priceEur: 249,
    aiEnabled: true,
    conversationsPerMonth: null, // illimité (fair-use)
    fairUseCap: 2000,
    features: [
      'Conversations IA illimitées (fair-use)',
      'GPT-4o sur les conversations',
      'Support prioritaire',
      'Volume élevé',
    ],
  },
}

export const PAID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

/**
 * Résout une valeur de plan stockée (profiles.plan / shopify_stores.plan) vers
 * un PlanId sûr. Défaut = 'free' (IA OFF) : un compte sans plan explicite n'a
 * pas d'IA. 'growth' = alias legacy du système Shopify → 'pro'.
 */
export function resolvePlan(value: string | null | undefined): PlanId {
  if (value === 'free' || value === 'starter' || value === 'pro' || value === 'scale') return value
  if (value === 'growth') return 'pro' // legacy shopify_stores.plan
  return 'free'
}
