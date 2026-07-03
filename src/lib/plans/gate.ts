import 'server-only'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { PLANS, resolvePlan, type PlanId } from './index'

/**
 * GATE IA CENTRAL — décide si un utilisateur a le droit d'utiliser l'IA.
 *
 * Règles (décisions produit) :
 * - Trial actif (subscription_status='trialing', non expiré) → IA AUTORISÉE
 *   (l'essai sert à goûter au produit), la limite tokens du trial s'applique.
 * - Sinon : le plan doit avoir aiEnabled (starter/pro/scale). Le plan 'free'
 *   (ou absent) = AUCUNE IA — gestion manuelle uniquement.
 * - Les admins sont toujours autorisés.
 *
 * À appeler AVANT tout appel OpenAI facturé (webhook SAV, routes IA,
 * campagnes). Les quotas (conversations/tokens) restent vérifiés séparément
 * par checkConversationQuota / checkTokenLimit.
 */
export type AiGateResult = {
  allowed: boolean
  reason: 'ok' | 'admin' | 'trial' | 'free_plan' | 'no_profile'
  plan: PlanId
}

export async function canUseAi(userId: string): Promise<AiGateResult> {
  const supabase = getAdminSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, role, subscription_status, trial_ends_at')
    .eq('id', userId)
    .single()

  if (!profile) return { allowed: false, reason: 'no_profile', plan: 'free' }

  const plan = resolvePlan(profile.plan)

  if (profile.role === 'admin') return { allowed: true, reason: 'admin', plan }

  // Trial actif → IA autorisée même sans plan payant.
  if (profile.subscription_status === 'trialing') {
    const trialOk = !profile.trial_ends_at || new Date(profile.trial_ends_at) > new Date()
    if (trialOk) return { allowed: true, reason: 'trial', plan }
  }

  if (PLANS[plan].aiEnabled) return { allowed: true, reason: 'ok', plan }
  return { allowed: false, reason: 'free_plan', plan }
}
