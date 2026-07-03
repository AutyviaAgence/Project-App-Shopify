import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPlan, countAiConversationsThisMonth } from '@/lib/shopify/plans'
import { canUseAi } from '@/lib/plans/gate'

/**
 * GET /api/subscription/usage — Utilisation du mois.
 * - conversations : la limite COMMERCIALE affichée (barre topbar, page abo)
 * - tokens : le backstop technique (conservé pour la page abonnement)
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

  // Conversations du mois vs limite du plan (l'unité commerciale affichée).
  const [plan, conversationsUsed, gate] = await Promise.all([
    getUserPlan(user.id),
    countAiConversationsThisMonth(user.id),
    canUseAi(user.id),
  ])
  const unlimited = plan.conversationsPerMonth === null
  const convLimit = plan.conversationsPerMonth ?? null
  const convPercentage = unlimited || !convLimit
    ? 0
    : Math.min(100, Math.round((conversationsUsed / convLimit) * 100))

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
        used: conversationsUsed,
        limit: convLimit, // null = illimité (fair-use)
        unlimited,
        percentage: convPercentage,
      },
    },
  })
}
