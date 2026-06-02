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
 */
export async function canUseAiAnalysis(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  const { plan, role } = await getUserPlan(supabase, userId)
  if (role === 'admin') return true
  return !!plan && (AI_PLANS as readonly string[]).includes(plan)
}
