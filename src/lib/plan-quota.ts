import { PLAN_LIMITS, resolvePlan } from '@/lib/stripe/plans'
import type { PlanId } from '@/lib/stripe/plans'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

// 'teams' retiré : le système d'équipes a été supprimé (refonte V2), la table
// teams/team_members n'existe plus en base.
type QuotaResource = 'sessions' | 'agents' | 'docs' | 'links' | 'automations'

const RESOURCE_TABLE: Record<QuotaResource, string> = {
  sessions: 'whatsapp_sessions',
  agents: 'ai_agents',
  docs: 'knowledge_documents',
  links: 'wa_links',
  // Campagnes ET transactionnelles : une seule table, donc un seul quota —
  // conforme à la grille (15 / 50 / 200, tous types confondus).
  automations: 'automations',
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

  // ⚠️ MARCHAND SHOPIFY : la source de vérité du plan est `shopify_stores`, PAS
  // `profiles` (le callback billing n'écrit jamais dans profiles). Lire
  // `profiles.subscription_status` ici bloquerait à tort un marchand qui paie.
  // getUserPlan() arbitre déjà les deux tables et n'ouvre les droits que si
  // l'abonnement Shopify est réellement actif (sinon il renvoie le plan `free`).
  const { getShopifyBilling, getUserPlan } = await import('@/lib/shopify/plans')
  const { billed } = await getShopifyBilling(userId)
  if (billed) {
    const effective = resolvePlan((await getUserPlan(userId)).id)
    // Plan effectif 'free' = pas d'abonnement Shopify actif → rien à créer.
    if (effective === 'free') {
      return { allowed: false, limit: 0, current: 0, plan: 'free', reason: 'no_subscription' }
    }
    const limitShopify = PLAN_LIMITS[effective][resource]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from(RESOURCE_TABLE[resource])
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    const currentShopify = count ?? 0
    if (currentShopify >= limitShopify) {
      return { allowed: false, limit: limitShopify, current: currentShopify, plan: effective, reason: 'limit_reached' }
    }
    return { allowed: true }
  }

  const subscriptionStatus = raw?.subscription_status ?? null

  // Abonnement inactif (chemin non-Shopify) → aucune création autorisée
  if (!subscriptionStatus || !ACTIVE_STATUSES.has(subscriptionStatus)) {
    return { allowed: false, limit: 0, current: 0, plan: resolvePlan(raw?.plan), reason: 'no_subscription' }
  }

  // Trial sans plan posé : limites Starter (l'essai doit permettre de goûter
  // au produit — le défaut 'free' de resolvePlan serait trop restrictif ici).
  const resolved = resolvePlan(raw?.plan)
  const plan = subscriptionStatus === 'trialing' && !raw?.plan ? 'starter' : resolved
  const limit = PLAN_LIMITS[plan][resource]

  let current = 0

  {
    // Sessions = uniquement WhatsApp (l'intégration email a été retirée).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
