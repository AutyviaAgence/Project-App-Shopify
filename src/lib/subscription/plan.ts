import type { SupabaseClient } from '@supabase/supabase-js'

// Plans qui débloquent les fonctionnalités IA "premium" (ex: analyse lifecycle).
const AI_PLANS = ['pro', 'scale'] as const

/**
 * Lit le plan de l'utilisateur (colonne profiles.plan).
 * Les admins sont toujours autorisés.
 */
export async function getUserPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string
): Promise<{ plan: string | null; role: string | null }> {
  const { data } = await supabase
    .from('profiles')
    .select('plan, role')
    .eq('id', userId)
    .single()
  return { plan: data?.plan ?? null, role: data?.role ?? null }
}

/**
 * true si l'utilisateur peut utiliser l'analyse IA (lifecycle) : plan pro/scale ou admin.
 *
 * ⚠️ MARCHAND SHOPIFY : le plan effectif vit dans `shopify_stores`, PAS dans
 * `profiles` (le callback billing n'écrit jamais dans profiles). Lire
 * `profiles.plan` ici refusait l'analyse lifecycle à un marchand Shopify Pro/Scale
 * qui paie. On passe donc par getUserPlan de @/lib/shopify/plans, qui arbitre les
 * deux tables et n'ouvre les droits que si l'abonnement Shopify est actif — même
 * correctif que gate.ts et plan-quota.ts.
 */
export async function canUseAiAnalysis(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  const { role } = await getUserPlan(supabase, userId)
  if (role === 'admin') return true
  const { getUserPlan: getEffectivePlan } = await import('@/lib/shopify/plans')
  const effective = (await getEffectivePlan(userId)).id
  return (AI_PLANS as readonly string[]).includes(effective)
}
