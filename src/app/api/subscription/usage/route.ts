import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPlan } from '@/lib/shopify/plans'
import { canUseAi } from '@/lib/plans/gate'
import { tokensToConversations } from '@/lib/plans'

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
  const usagePercentage = profile.tokens_limit > 0
    ? Math.round((profile.tokens_used / profile.tokens_limit) * 100)
    : 100

  const [plan, gate] = await Promise.all([
    getUserPlan(user.id),
    canUseAi(user.id),
  ])

  // Conversion tokens → conversations (barre remplie par la conso tokens,
  // affichée en conversations restantes).
  const conv = tokensToConversations(
    profile.tokens_used,
    profile.tokens_limit,
    plan.conversationsPerMonth
  )

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
        used: conv.used,
        limit: conv.limit,          // null = illimité (fair-use)
        remaining: conv.remaining,  // null = illimité
        unlimited: conv.unlimited,
        percentage: conv.percentage, // % rempli = tokens_used / tokens_limit
        // Plafond fair-use (scale) : sert de repère visuel pour la barre des
        // plans « illimités » (0 pour les autres plans).
        fairUseCap: plan.fairUseCap ?? null,
      },
    },
  })
}
