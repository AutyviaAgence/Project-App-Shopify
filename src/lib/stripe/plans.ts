// Fichier partagé client/serveur — aucun import Node.js

export type PlanId = 'starter' | 'pro' | 'scale'

export const PLAN_PRICES_EUR: Record<PlanId, number> = {
  starter: 29,
  pro: 79,
  scale: 149,
}

export const PLAN_TOKEN_LIMITS: Record<PlanId, number> = {
  starter: 500_000,
  pro: 1_500_000,
  scale: 4_000_000,
}

export const VALID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

export type PlanLimits = {
  sessions: number
  agents: number
  docs: number
  links: number
  teams: number
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  starter: { sessions: 2,  agents: 2,  docs: 5,  links: 3,  teams: 2  },
  pro:     { sessions: 4,  agents: 5,  docs: 10, links: 8,  teams: 4  },
  scale:   { sessions: 10, agents: 10, docs: 30, links: 15, teams: 10 },
}

export function resolvePlan(value: string | null | undefined): PlanId {
  if (value === 'starter' || value === 'pro' || value === 'scale') return value
  return 'starter'
}
