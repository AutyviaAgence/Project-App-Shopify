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
    .select('plan, role')
    .eq('id', userId)
    .single()

  if (!profile) return { allowed: false, reason: 'no_profile', plan: 'free' }

  const plan = resolvePlan(profile.plan)

  if (profile.role === 'admin') return { allowed: true, reason: 'admin', plan }

  // DÉCISION PRODUIT : l'IA exige un plan avec aiEnabled, sans exception.
  // L'ancien bypass « subscription_status = trialing » laissait passer TOUS
  // les comptes Gratuit : le statut restait accroché à l'inscription et, avec
  // trial_ends_at null, ne « expirait » jamais. Un vrai essai Stripe sur un
  // plan payant est déjà couvert : le plan (starter/pro/scale) a aiEnabled.
  if (PLANS[plan].aiEnabled) return { allowed: true, reason: 'ok', plan }
  return { allowed: false, reason: 'free_plan', plan }
}

/**
 * Variante ONBOARDING : autorise l'IA/les créations tant que l'onboarding
 * n'est pas terminé (le pack gratuit — agent, modèles, automatisations — est
 * généré/appliqué AVANT le choix du plan). Après l'onboarding, applique les
 * règles normales de canUseAi (Gratuit bloqué).
 *
 * Sert aux endpoints de création/IA qui doivent marcher pendant l'onboarding
 * mais rester payants ensuite (templates generate/converse, automations
 * suggest…). Évite de dupliquer le pattern onboarding_completed_at partout.
 */
export async function canUseAiOrOnboarding(userId: string): Promise<AiGateResult> {
  const gate = await canUseAi(userId)
  if (gate.allowed) return gate
  // Non autorisé (Gratuit) : on laisse passer UNIQUEMENT si l'onboarding est
  // encore en cours.
  const supabase = getAdminSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle()
  if (profile && !(profile as { onboarding_completed_at: string | null }).onboarding_completed_at) {
    return { allowed: true, reason: 'ok', plan: gate.plan }
  }
  return gate
}

/**
 * Droit de CRÉER du contenu premium (modèles de messages, agents).
 * Même règle que l'IA : réservé aux plans payants ; toléré pendant l'onboarding
 * (le pack gratuit crée des modèles avant le choix du plan). Alias sémantique
 * de canUseAiOrOnboarding pour la lisibilité côté endpoints non-IA.
 */
export const canCreateContent = canUseAiOrOnboarding
