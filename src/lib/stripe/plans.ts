// Fichier partagé client/serveur — aucun import Node.js
//
// La GRILLE (prix, features, gating IA) vit dans @/lib/plans (source de vérité
// unique). Ce module garde les limites techniques côté Stripe : tokens
// (backstop anti-abus, PAS la limite commerciale affichée) et limites de
// ressources (sessions/agents/docs...).

import { PLANS, resolvePlan as resolveUnified, type PlanId } from '@/lib/plans'

export type { PlanId } from '@/lib/plans'
/** Plans achetables via Stripe (le plan free ne passe pas par un checkout). */
export type PaidPlanId = 'starter' | 'pro' | 'scale'

export const PLAN_PRICES_EUR: Record<PlanId, number> = {
  free: PLANS.free.priceEur,
  starter: PLANS.starter.priceEur,
  pro: PLANS.pro.priceEur,
  scale: PLANS.scale.priceEur,
}

// Backstop tokens (anti-abus silencieux). free = 0 : aucune IA.
export const PLAN_TOKEN_LIMITS: Record<PlanId, number> = {
  free: 0,
  starter: 500_000,
  pro: 1_500_000,
  scale: 4_000_000,
}

export const VALID_PLANS: PaidPlanId[] = ['starter', 'pro', 'scale']

export type PlanLimits = {
  sessions: number
  agents: number
  docs: number
  links: number
  teams: number
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free:    { sessions: 1,  agents: 1,  docs: 2,  links: 1,  teams: 0  },
  starter: { sessions: 2,  agents: 2,  docs: 5,  links: 3,  teams: 2  },
  pro:     { sessions: 4,  agents: 5,  docs: 10, links: 8,  teams: 4  },
  scale:   { sessions: 10, agents: 10, docs: 30, links: 15, teams: 10 },
}

/** Défaut 'free' (IA OFF) — voir @/lib/plans. */
export function resolvePlan(value: string | null | undefined): PlanId {
  return resolveUnified(value)
}
