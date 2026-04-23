import { PLAN_LIMITS, resolvePlan } from '@/lib/stripe/plans'
import type { PlanId } from '@/lib/stripe/plans'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

type QuotaResource = 'sessions' | 'agents' | 'docs' | 'links' | 'teams'

const RESOURCE_TABLE: Record<QuotaResource, string> = {
  sessions: 'whatsapp_sessions',
  agents: 'ai_agents',
  docs: 'knowledge_documents',
  links: 'wa_links',
  teams: 'team_members',
}

/** Returns { allowed: true } or { allowed: false, limit, current, plan } */
export async function checkPlanQuota(
  supabase: SupabaseClient,
  userId: string,
  resource: QuotaResource
): Promise<{ allowed: true } | { allowed: false; limit: number; current: number; plan: PlanId }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single()

  const plan = resolvePlan((profile as { plan?: string } | null)?.plan)
  const limit = PLAN_LIMITS[plan][resource]

  let countQuery = supabase
    .from(RESOURCE_TABLE[resource] as 'whatsapp_sessions')
    .select('id', { count: 'exact', head: true })

  if (resource === 'teams') {
    // Pour les équipes on compte les memberships owner
    countQuery = (supabase as any)
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId) as any
  } else {
    countQuery = (countQuery as any).eq('user_id', userId) as any
  }

  const { count } = await countQuery
  const current = count ?? 0

  if (current >= limit) {
    return { allowed: false, limit, current, plan }
  }

  return { allowed: true }
}
