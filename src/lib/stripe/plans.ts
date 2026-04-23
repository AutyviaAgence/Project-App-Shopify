// Fichier partagé client/serveur — aucun import Node.js

export type PlanId = 'starter' | 'pro' | 'scale'

export const PLAN_PRICES_EUR: Record<PlanId, number> = {
  starter: 39,
  pro: 79,
  scale: 150,
}

export const PLAN_TOKEN_LIMITS: Record<PlanId, number> = {
  starter: 500_000,
  pro: 1_500_000,
  scale: 4_000_000,
}

export const VALID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

export function resolvePlan(value: string | null | undefined): PlanId {
  if (value === 'starter' || value === 'pro' || value === 'scale') return value
  return 'scale'
}
