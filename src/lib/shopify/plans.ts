import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * Plans & quotas Xeyo (côté Shopify Billing).
 *
 * Unité vendue : "conversation traitée" = conversation où l'agent IA a généré
 * au moins une réponse (comptée une fois). Garde-fou interne : tokens (déjà
 * géré par profiles.tokens_limit/tokens_used).
 *
 * Le plan free n'utilise PAS la Billing API Shopify (gratuit). Les plans
 * payants créent un AppSubscription Shopify.
 */

export type PlanId = 'free' | 'starter' | 'growth' | 'scale'

export type Plan = {
  id: PlanId
  name: string
  pricePerMonth: number // EUR
  conversations: number // conversations IA incluses / mois (Infinity = illimité)
  features: string[]
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    pricePerMonth: 0,
    conversations: 10,
    features: ['10 conversations IA / mois', '1 numéro WhatsApp', 'Agent IA auto-configuré'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    pricePerMonth: 29,
    conversations: 200,
    features: ['200 conversations IA / mois', 'Modèles WhatsApp', 'Base de connaissances Shopify'],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    pricePerMonth: 79,
    conversations: 1000,
    features: ['1 000 conversations IA / mois', 'Actions Shopify (annulation, remboursement…)', 'Multi-agents'],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    pricePerMonth: 149,
    conversations: 3000,
    features: ['3 000 conversations IA / mois', 'Support prioritaire', 'Volume élevé'],
  },
}

export const PAID_PLANS: PlanId[] = ['starter', 'growth', 'scale']

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Compte les conversations traitées par l'IA ce mois-ci pour un utilisateur.
 * = nombre de conversations distinctes ayant au moins un message sortant IA
 * (sent_by = 'ai_agent') depuis le début du mois.
 */
export async function countAiConversationsThisMonth(userId: string): Promise<number> {
  const supabase = admin()

  // Sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', userId)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) return 0

  const periodStart = new Date()
  periodStart.setDate(1)
  periodStart.setHours(0, 0, 0, 0)

  // Conversations distinctes avec au moins un message IA ce mois-ci
  const { data: msgs } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('session_id', sessionIds)
    .eq('sent_by', 'ai_agent')
    .gte('created_at', periodStart.toISOString())

  const distinct = new Set((msgs || []).map((m) => m.conversation_id))
  return distinct.size
}

/**
 * Détermine le plan effectif d'un utilisateur et son quota de conversations.
 * Source de vérité : billing_source. Si shopify → plan de shopify_stores ;
 * sinon → plan de profiles. Défaut : free.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const supabase = admin()

  // Boutique Shopify liée ?
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('plan, billing_source')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (store?.billing_source === 'shopify') {
    return PLANS[(store.plan as PlanId) in PLANS ? (store.plan as PlanId) : 'free']
  }

  // Sinon plan direct (profiles.plan) — fallback free
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()

  const p = (profile?.plan as PlanId)
  return PLANS[p in PLANS ? p : 'free']
}

/**
 * Vérifie si l'utilisateur peut encore faire répondre l'IA (quota conversations).
 * Renvoie allowed=false avec used/limit si le quota est atteint.
 */
export async function checkConversationQuota(userId: string): Promise<{
  allowed: boolean
  used: number
  limit: number
  plan: PlanId
}> {
  const plan = await getUserPlan(userId)
  if (plan.conversations === Infinity) {
    return { allowed: true, used: 0, limit: Infinity, plan: plan.id }
  }
  const used = await countAiConversationsThisMonth(userId)
  return { allowed: used < plan.conversations, used, limit: plan.conversations, plan: plan.id }
}
