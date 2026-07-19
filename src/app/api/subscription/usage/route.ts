import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPlan, checkConversationQuota } from '@/lib/shopify/plans'
import { canUseAi } from '@/lib/plans/gate'

/**
 * GET /api/subscription/usage — Utilisation du mois.
 *
 * La jauge « conversations » est DÉRIVÉE des tokens consommés
 * (profiles.tokens_used) via un ratio calé sur la grille — la barre se remplit
 * avec la conso tokens, mais on affiche « XX conversations restantes ». Pas de
 * scan des messages (rapide). Les champs tokens bruts restent exposés pour la
 * page abonnement.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('tokens_used, tokens_limit, token_usage_period_start')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }

  const tokensRemaining = Math.max(0, profile.tokens_limit - profile.tokens_used)
  // ⚠️ Quota INCONNU (tokens_limit = 0, compte tout juste créé) ≠ quota ÉPUISÉ.
  // Le défaut 100 % faisait croire à une limite atteinte dès l'inscription.
  const usagePercentage = profile.tokens_limit > 0
    ? Math.round((profile.tokens_used / profile.tokens_limit) * 100)
    : 0

  const [plan, gate, quota] = await Promise.all([
    getUserPlan(user.id),
    canUseAi(user.id),
    checkConversationQuota(user.id),
  ])

  // Conso RÉELLE de conversations IA du mois (le vrai compteur qui bloque),
  // pas une estimation par tokens → la barre est exacte et cohérente.
  const limit = quota.limit === Infinity ? null : quota.limit
  const remaining = limit === null ? null : Math.max(0, limit - quota.used)
  const percentage = limit && limit > 0 ? Math.min(100, Math.round((quota.used / limit) * 100)) : 0

  return NextResponse.json({
    data: {
      tokens_used: profile.tokens_used,
      tokens_limit: profile.tokens_limit,
      tokens_remaining: tokensRemaining,
      usage_percentage: usagePercentage,
      period_start: profile.token_usage_period_start,
      plan: plan.id,
      ai_enabled: gate.allowed,
      conversations: {
        used: quota.used,
        limit,
        remaining,
        unlimited: limit === null,
        percentage,
        fairUseCap: plan.fairUseCap ?? null,
      },
    },
  })
}
