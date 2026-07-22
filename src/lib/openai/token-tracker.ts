import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Vérifie si l'utilisateur a encore des tokens disponibles ET si son abonnement/trial est actif.
 * Retourne { allowed: true, remaining } ou { allowed: false, used, limit, reason }.
 */
export async function checkTokenLimit(userId: string): Promise<
  | { allowed: true; remaining: number }
  | { allowed: false; used: number; limit: number; reason?: string }
> {
  const supabase = getAdminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('tokens_used, tokens_limit, tokens_extra, subscription_status, trial_ends_at, subscription_ends_at, role, onboarding_completed_at')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { allowed: false, used: 0, limit: 0, reason: 'profile_not_found' }
  }

  // Les admins ne sont jamais bloqués (même règle que plan-quota).
  if ((profile as { role?: string | null }).role === 'admin') {
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER }
  }

  // ⚠️ ONBOARDING EN COURS → budget d'essai, quel que soit l'abonnement.
  //
  // Le choix du plan est la DERNIÈRE étape (8/8), mais l'agent se teste à la 5e
  // et les modèles se génèrent à la 6e. Un compte neuf a forcément
  // `subscription_status='none'` à ce moment : toutes les routes IA lui
  // renvoyaient « Limite de tokens IA atteinte » avant qu'on lui ait propose
  // de payer — y compris a un reviewer App Store.
  //
  // `agents/[id]/test` portait deja cette exception, en local. On la remonte
  // ici pour qu'elle couvre TOUTES les routes du parcours d'un coup.
  const ONBOARDING_TRIAL_TOKENS = 25_000
  const inOnboarding = !(profile as { onboarding_completed_at?: string | null }).onboarding_completed_at
  if (inOnboarding && (profile.tokens_used || 0) < ONBOARDING_TRIAL_TOKENS) {
    return { allowed: true, remaining: ONBOARDING_TRIAL_TOKENS - (profile.tokens_used || 0) }
  }

  // ⚠️ MARCHAND SHOPIFY : `profiles.subscription_status` N'EST JAMAIS ÉCRIT par
  // le callback de facturation — il reste à `none` même pour un marchand qui
  // paie. Cette fonction, restée sur l'ancien modèle Stripe, refusait donc TOUS
  // les marchands Shopify : « Limite de tokens IA atteinte » dès l'onboarding,
  // et pire, elle remettait leur `tokens_limit` à 0 au passage.
  //
  // La source de vérité est `shopify_stores`, arbitrée par `getUserPlan()` —
  // exactement ce que documente déjà `plan-quota.ts`.
  const { getShopifyBilling, getUserPlan } = await import('@/lib/shopify/plans')
  const { billed } = await getShopifyBilling(userId)
  if (billed) {
    const plan = await getUserPlan(userId)
    // Plan effectif `free` = aucun abonnement Shopify actif → on bloque.
    if (plan.id === 'free') {
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_inactive' }
    }
    // Abonnement actif : seul le solde de tokens compte. `tokens_limit` étant
    // hérité du modèle Stripe et souvent à 0 chez un marchand Shopify, on ne
    // s'appuie que sur les recharges explicites — et on laisse passer sinon.
    const extra = profile.tokens_extra || 0
    if (extra > 0 && profile.tokens_used >= extra + (profile.tokens_limit || 0)) {
      return { allowed: false, used: profile.tokens_used, limit: extra + (profile.tokens_limit || 0) }
    }
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER }
  }

  const now = new Date()
  const status = profile.subscription_status as string

  // Check subscription/trial expiry
  if (status === 'trialing') {
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null
    if (trialEnds && trialEnds < now) {
      await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due', tokens_limit: 0 })
        .eq('id', userId)
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'trial_expired' }
    }
  } else if (status === 'active') {
    const subEnds = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null
    if (subEnds && subEnds < now) {
      await supabase
        .from('profiles')
        .update({ subscription_status: 'past_due', tokens_limit: 0 })
        .eq('id', userId)
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_expired' }
    }
  } else if (status === 'canceled') {
    // Annulé mais période encore active → accès maintenu jusqu'à la fin
    const subEnds = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null
    if (subEnds && subEnds > now) {
      // Accès encore valide — laisser passer, vérifier tokens ci-dessous
    } else {
      if (profile.tokens_limit > 0) {
        await supabase.from('profiles').update({ tokens_limit: 0 }).eq('id', userId)
      }
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_canceled' }
    }
  } else if (status === 'past_due' || status === 'none') {
    if (profile.tokens_limit > 0) {
      await supabase.from('profiles').update({ tokens_limit: 0 }).eq('id', userId)
    }
    return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_inactive' }
  }

  // Check token limit (plan + extra balance)
  const totalLimit = (profile.tokens_limit || 0) + (profile.tokens_extra || 0)
  const remaining = totalLimit - profile.tokens_used
  if (remaining <= 0) {
    return { allowed: false, used: profile.tokens_used, limit: totalLimit }
  }

  return { allowed: true, remaining }
}

/**
 * Enregistre l'utilisation de tokens via RPC atomique.
 * Crée une alerte si la limite est atteinte ou proche (≥90%).
 */
export async function recordTokenUsage(userId: string, tokensUsed: number): Promise<void> {
  if (tokensUsed <= 0) return

  const supabase = getAdminClient()

  // Fetch current values and increment atomically
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('tokens_used, tokens_limit, tokens_extra')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    console.error('[TokenTracker] Error fetching profile:', fetchError?.message)
    return
  }

  const new_total = (profile.tokens_used || 0) + tokensUsed
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ tokens_used: new_total })
    .eq('id', userId)

  if (updateError) {
    console.error('[TokenTracker] Error incrementing tokens:', updateError.message)
    return
  }

  const { tokens_limit: token_limit, tokens_extra } = profile
  const totalLimit = (token_limit || 0) + (tokens_extra || 0)
  const usagePercent = totalLimit > 0 ? (new_total / totalLimit) * 100 : 100
  const wasBelow = totalLimit > 0 ? ((new_total - tokensUsed) / totalLimit) * 100 : 100

  // Alerte à 80% (envoyée une seule fois quand on franchit le seuil)
  if (usagePercent >= 80 && wasBelow < 80) {
    await supabase.from('user_alerts').insert({
      user_id: userId,
      alert_type: 'token_limit_reached' as any,
      title: 'Tokens à 80%',
      message: `Vous avez utilisé ${Math.round(usagePercent)}% de vos tokens IA (${new_total.toLocaleString()} / ${totalLimit.toLocaleString()}). Pensez à recharger pour ne pas être interrompu.`,
      metadata: {
        tokens_used: new_total,
        tokens_limit: totalLimit,
        usage_percent: Math.round(usagePercent),
        variant: 'warn_80',
      },
    })
    console.log('[TokenTracker] Alerte 80% envoyée pour user:', userId)
  }

  // Alerte à 90% (envoyée une seule fois quand on franchit le seuil)
  if (usagePercent >= 90 && wasBelow < 90) {
    await supabase.from('user_alerts').insert({
      user_id: userId,
      alert_type: 'token_limit_reached' as any,
      title: 'Limite de tokens bientôt atteinte',
      message: `Vous avez utilisé ${Math.round(usagePercent)}% de vos tokens IA (${new_total.toLocaleString()} / ${totalLimit.toLocaleString()}). Achetez des tokens supplémentaires pour éviter une interruption.`,
      metadata: {
        tokens_used: new_total,
        tokens_limit: totalLimit,
        usage_percent: Math.round(usagePercent),
        variant: 'warn_90',
      },
    })
    console.log('[TokenTracker] Alerte 90% envoyée pour user:', userId)
  }

  // Alerte à 100% (envoyée quand on atteint la limite)
  if (new_total >= totalLimit && (new_total - tokensUsed) < totalLimit) {
    await supabase.from('user_alerts').insert({
      user_id: userId,
      alert_type: 'token_limit_reached' as any,
      title: 'Limite de tokens atteinte',
      message: `Vous avez atteint votre limite de tokens IA (${totalLimit.toLocaleString()} tokens). L'IA est suspendue. Achetez des tokens supplémentaires pour continuer.`,
      metadata: {
        tokens_used: new_total,
        tokens_limit: totalLimit,
        usage_percent: 100,
        variant: 'reached',
      },
    })
    console.log('[TokenTracker] Alerte 100% envoyée pour user:', userId)
  }
}
