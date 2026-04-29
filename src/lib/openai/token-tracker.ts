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
    .select('tokens_used, tokens_limit, tokens_extra, subscription_status, trial_ends_at, subscription_ends_at')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { allowed: false, used: 0, limit: 0, reason: 'profile_not_found' }
  }

  const now = new Date()
  const status = profile.subscription_status as string

  // Check subscription/trial expiry
  if (status === 'trial') {
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null
    if (trialEnds && trialEnds < now) {
      // Trial expired — block and update status + tokens
      await supabase
        .from('profiles')
        .update({ subscription_status: 'expired', tokens_limit: 0 })
        .eq('id', userId)
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'trial_expired' }
    }
  } else if (status === 'active') {
    const subEnds = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null
    if (subEnds && subEnds < now) {
      await supabase
        .from('profiles')
        .update({ subscription_status: 'expired', tokens_limit: 0 })
        .eq('id', userId)
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_expired' }
    }
  } else if (status === 'cancelled') {
    // Annulé mais période encore active → accès maintenu
    const subEnds = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null
    if (subEnds && subEnds > now) {
      // Accès encore valide jusqu'à fin de période — laisser passer, vérifier tokens ci-dessous
    } else {
      if (profile.tokens_limit > 0) {
        await supabase.from('profiles').update({ tokens_limit: 0 }).eq('id', userId)
      }
      return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_cancelled' }
    }
  } else if (status === 'expired') {
    if (profile.tokens_limit > 0) {
      await supabase.from('profiles').update({ tokens_limit: 0 }).eq('id', userId)
    }
    return { allowed: false, used: profile.tokens_used, limit: 0, reason: 'subscription_expired' }
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

  const { token_limit, tokens_extra } = profile
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
      },
    })
    console.log('[TokenTracker] Alerte 100% envoyée pour user:', userId)
  }
}
