import { PLAN_LIMITS, resolvePlan } from '@/lib/stripe/plans'
import type { PlanId } from '@/lib/stripe/plans'
import { createAdminClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

type QuotaResource = 'sessions' | 'agents' | 'docs' | 'links' | 'teams'

const RESOURCE_TABLE: Record<QuotaResource, string> = {
  sessions: 'whatsapp_sessions',
  agents: 'ai_agents',
  docs: 'knowledge_documents',
  links: 'wa_links',
  teams: 'team_members',
}

const ACTIVE_STATUSES = new Set(['active', 'trial'])

// Mode observateur : trial + aucun plan + onboarding actif
// Seule la création d'équipe est autorisée, tout le reste est bloqué en lecture seule
const OBSERVER_ALLOWED: QuotaResource[] = ['teams']

/** Returns { allowed: true } or { allowed: false, limit, current, plan, reason } */
export async function checkPlanQuota(
  supabase: SupabaseClient,
  userId: string,
  resource: QuotaResource
): Promise<{ allowed: true } | { allowed: false; limit: number; current: number; plan: PlanId; reason: 'no_subscription' | 'limit_reached' | 'observer_mode' }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, subscription_status, onboarding_status, role')
    .eq('id', userId)
    .single()

  const raw = profile as { plan?: string | null; subscription_status?: string; onboarding_status?: string; role?: string | null } | null

  // Les admins ne sont jamais bloqués par les quotas
  if (raw?.role === 'admin') return { allowed: true }

  const subscriptionStatus = raw?.subscription_status ?? null

  // Mode observateur : onboarding_status = 'observer' → lecture seule sauf équipe
  const isObserver = raw?.onboarding_status === 'observer'
  if (isObserver) {
    if (OBSERVER_ALLOWED.includes(resource)) return { allowed: true }
    return { allowed: false, limit: 0, current: 0, plan: resolvePlan(null), reason: 'observer_mode' }
  }

  // Abonnement inactif → aucune création autorisée
  if (!subscriptionStatus || !ACTIVE_STATUSES.has(subscriptionStatus)) {
    return { allowed: false, limit: 0, current: 0, plan: resolvePlan(raw?.plan), reason: 'no_subscription' }
  }

  const plan = resolvePlan(raw?.plan)
  const limit = PLAN_LIMITS[plan][resource]

  let current = 0

  if (resource === 'teams') {
    const { count } = await (supabase as any)
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
    current = count ?? 0
  } else if (resource === 'sessions') {
    // Sessions = WhatsApp + Email combinés — admin client pour bypasser les limites de typage
    const adminSupabase = await createAdminClient()
    const [waResult, emailResult] = await Promise.all([
      supabase.from('whatsapp_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      adminSupabase.from('email_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    current = (waResult.count ?? 0) + (emailResult.count ?? 0)
  } else {
    const { count } = await (supabase as any)
      .from(RESOURCE_TABLE[resource])
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    current = count ?? 0
  }

  if (current >= limit) {
    return { allowed: false, limit, current, plan, reason: 'limit_reached' }
  }

  return { allowed: true }
}
