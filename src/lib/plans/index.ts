// =====================================================================
//  GRILLE DE PLANS — SOURCE DE VÉRITÉ UNIQUE
//
//  Fichier partagé client/serveur (aucun import Node). Toute référence à un
//  plan (prix, limites, features, gating IA) doit passer par ce module —
//  stripe/plans.ts et shopify/plans.ts s'alignent dessus.
//
//  Modèle commercial (100 % Shopify Billing — plus de plan gratuit exposé) :
//  - starter : 49€  — 550 conversations IA / mois
//  - pro      : 149€ — 1 800 conversations IA / mois
//  - scale   : 349€ — 4 500 conversations IA / mois (fair-use)
//
//  Chaque plan payant se décline en MENSUEL ou ANNUEL (-20 %, 2 mois offerts),
//  avec 7 jours d'essai gratuit sur tout nouvel abonnement.
//
//  'free' N'EST PLUS un plan commercial : il subsiste UNIQUEMENT comme sentinelle
//  interne « aucun abonnement actif » (résolution par défaut, gating IA off). Il
//  n'apparaît jamais dans l'UI ni dans PAID_PLANS.
//
//  Unité affichée : conversations estimées (1 conversation ≈ 1 contact/mois).
//  Les tokens (PLAN_TOKEN_LIMITS, stripe/plans.ts) restent un backstop
//  anti-abus silencieux, pas la limite commerciale.
// =====================================================================

export type PlanId = 'free' | 'starter' | 'pro' | 'scale'

/** Intervalle de facturation Shopify. */
export type BillingInterval = 'monthly' | 'annual'

/**
 * Remise annuelle (2 mois offerts). Un seul chiffre à changer pour ajuster.
 * annualPrice = round(priceEur * 12 * (1 - ANNUAL_DISCOUNT)).
 */
export const ANNUAL_DISCOUNT = 0.20

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
  /** Nombre max d'agents IA (gating : Starter = 1, Pro/Scale = plusieurs). */
  maxAgents: number
  features: string[]
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    priceEur: 0,
    aiEnabled: false,
    conversationsPerMonth: 0,
    maxAgents: 0,
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
    priceEur: 49,
    aiEnabled: true,
    conversationsPerMonth: 550,
    maxAgents: 1,
    features: [
      '550 conversations IA / mois',
      'Agent IA auto-configuré (routage gpt-4o / mini)',
      'Base de connaissances Shopify',
      'Automatisations & templates illimités (panier abandonné…)',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceEur: 149,
    aiEnabled: true,
    conversationsPerMonth: 1800,
    maxAgents: 5,
    features: [
      '1 800 conversations IA / mois',
      'Actions Shopify (annulation, remboursement…)',
      'Multi-agents IA',
      'Analyse lifecycle IA',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    priceEur: 349,
    aiEnabled: true,
    conversationsPerMonth: 4500,
    fairUseCap: 4500,
    maxAgents: 20,
    features: [
      '4 500 conversations IA / mois',
      'GPT-4o prioritaire sur les demandes sensibles',
      'Support prioritaire',
      'Volume élevé + crédits supplémentaires',
    ],
  },
}

export const PAID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

/**
 * Prix annuel d'un plan (mensuel × 12 avec ANNUAL_DISCOUNT), arrondi à l'euro.
 * Ex. Starter 49€ → 470€/an · Pro 149€ → 1430€/an · Scale 349€ → 3350€/an.
 */
export function annualPrice(plan: PlanId): number {
  return Math.round(PLANS[plan].priceEur * 12 * (1 - ANNUAL_DISCOUNT))
}

/** Prix affiché selon l'intervalle choisi. */
export function planPrice(plan: PlanId, interval: BillingInterval): number {
  return interval === 'annual' ? annualPrice(plan) : PLANS[plan].priceEur
}

/** Nombre max d'agents IA autorisés pour un plan (gating). */
export function maxAgents(plan: PlanId): number {
  return PLANS[plan].maxAgents
}

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

/**
 * Convertit une consommation de tokens en « conversations » pour l'affichage.
 *
 * On ne compte PAS les conversations réelles : on part des tokens consommés
 * (profiles.tokens_used) et on divise par un ratio « tokens par conversation »
 * calé sur la grille — pour que la jauge affiche pile les ~100/~500 conv
 * annoncées quand tokens_used atteint tokens_limit. Ratio = tokens_limit du
 * plan ÷ conversations du plan (ex. Starter 500 000 ÷ 100 = 5 000 tok/conv).
 *
 * @param tokensUsed   tokens consommés ce mois (profiles.tokens_used)
 * @param tokensLimit  quota tokens du plan (profiles.tokens_limit)
 * @param conversationsPerMonth  conversations affichées du plan (null = illimité)
 */
export function tokensToConversations(
  tokensUsed: number,
  tokensLimit: number,
  conversationsPerMonth: number | null
): { used: number; limit: number | null; remaining: number | null; percentage: number; unlimited: boolean } {
  // Plan illimité (scale) : pas de limite convertie, on montre juste le nombre
  // estimé de conversations consommées (ratio par défaut ~5000 tok/conv).
  if (conversationsPerMonth === null || conversationsPerMonth <= 0) {
    const used = Math.floor(tokensUsed / 5000)
    return { used, limit: null, remaining: null, percentage: 0, unlimited: true }
  }
  const tokensPerConversation = Math.max(1, Math.round(tokensLimit / conversationsPerMonth))
  const used = Math.floor(tokensUsed / tokensPerConversation)
  const remaining = Math.max(0, conversationsPerMonth - used)
  const percentage = tokensLimit > 0
    ? Math.min(100, Math.round((tokensUsed / tokensLimit) * 100))
    : 0
  return { used, limit: conversationsPerMonth, remaining, percentage, unlimited: false }
}
