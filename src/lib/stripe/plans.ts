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
// Dimensionné large : c'est le QUOTA DE CONVERSATIONS (plans/index.ts) qui est la
// vraie limite commerciale ; ce backstop ne doit bloquer qu'en cas d'abus extrême.
// ~40k tokens/conversation → on prévoit avec marge.
export const PLAN_TOKEN_LIMITS: Record<PlanId, number> = {
  free: 0,
  starter: 30_000_000,   // ~550 conv
  pro: 90_000_000,       // ~1 800 conv
  scale: 220_000_000,    // ~4 500 conv
}

export const VALID_PLANS: PaidPlanId[] = ['starter', 'pro', 'scale']

export type PlanLimits = {
  sessions: number
  agents: number
  docs: number
  links: number
}

// ⚠️ `agents` est dérivé de PLANS[].maxAgents (source de vérité unique du
// gating multi-agents : Starter = 1, Pro/Scale = plusieurs). Ne pas diverger.
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free:    { sessions: 1,  agents: PLANS.free.maxAgents,    docs: 2,  links: 1  },
  starter: { sessions: 2,  agents: PLANS.starter.maxAgents, docs: 5,  links: 3  },
  pro:     { sessions: 4,  agents: PLANS.pro.maxAgents,     docs: 10, links: 8  },
  scale:   { sessions: 10, agents: PLANS.scale.maxAgents,   docs: 30, links: 15 },
}

/** Défaut 'free' (IA OFF) — voir @/lib/plans. */
export function resolvePlan(value: string | null | undefined): PlanId {
  return resolveUnified(value)
}
