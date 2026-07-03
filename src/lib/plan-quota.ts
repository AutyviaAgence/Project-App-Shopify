import { PLAN_LIMITS, resolvePlan } from '@/lib/stripe/plans'
import type { PlanId } from '@/lib/stripe/plans'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type QuotaResource = 'sessions' | 'agents' | 'docs' | 'links' | 'teams'

const RESOURCE_TABLE: Record<QuotaResource, string> = {
  sessions: 'whatsapp_sessions',
  agents: 'ai_agents',
  docs: 'knowledge_documents',
  links: 'wa_links',
  teams: 'team_members',
}

const ACTIVE_STATUSES = new Set(['active', 'trialing'])

/** Returns { allowed: true } or { allowed: false, limit, current, plan, reason } */
export async function checkPlanQuota(
  supabase: SupabaseClient,
  userId: string,
  resource: QuotaResource
): Promise<{ allowed: true } | { allowed: false; limit: number; current: number; plan: PlanId; reason: 'no_subscription' | 'limit_reached' | 'observer_mode' }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, subscription_status, role')
    .eq('id', userId)
    .single()

  const raw = profile as { plan?: string | null; subscription_status?: string; role?: string | null } | null

  // Les admins ne sont jamais bloqués par les quotas
  if (raw?.role === 'admin') return { allowed: true }

  const subscriptionStatus = raw?.subscription_status ?? null

  // Abonnement inactif → aucune création autorisée
  if (!subscriptionStatus || !ACTIVE_STATUSES.has(subscriptionStatus)) {
    return { allowed: false, limit: 0, current: 0, plan: resolvePlan(raw?.plan), reason: 'no_subscription' }
  }

  // Trial sans plan posé : limites Starter (l'essai doit permettre de goûter
  // au produit — le défaut 'free' de resolvePlan serait trop restrictif ici).
  const resolved = resolvePlan(raw?.plan)
  const plan = subscriptionStatus === 'trialing' && !raw?.plan ? 'starter' : resolved
  const limit = PLAN_LIMITS[plan][resource]

  let current = 0

  if (resource === 'teams') {
    const { count } = await (supabase as any)
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
    current = count ?? 0
  } else if (resource === 'sessions') {
    // Sessions = WhatsApp + Email combinés
    const adminSupabase = getAdminClient()
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
