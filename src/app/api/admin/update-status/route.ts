import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PLAN_TOKEN_LIMITS, resolvePlan } from '@/lib/stripe/plans'

/** POST /api/admin/update-status — Mettre à jour le statut d'un client (admin only) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { user_id, onboarding_status, subscription_status, plan: rawPlan, role } = body

  if (!user_id) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const update: Record<string, unknown> = {}

  if (onboarding_status && ['pending', 'onboarding', 'active'].includes(onboarding_status)) {
    update.onboarding_status = onboarding_status
  }

  if (subscription_status && ['active', 'trial', 'expired', 'cancelled'].includes(subscription_status)) {
    update.subscription_status = subscription_status
    if (subscription_status === 'active' || subscription_status === 'trial') {
      // rawPlan explicitement null = mode observateur, on ne force pas de plan
      if (rawPlan === null && body.hasOwnProperty('plan')) {
        update.plan = null
        update.tokens_limit = 0
      } else {
        const plan = resolvePlan(rawPlan)
        update.plan = plan
        update.tokens_limit = PLAN_TOKEN_LIMITS[plan]
      }
      update.tokens_used = 0
      update.token_usage_period_start = new Date().toISOString()
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      update.subscription_ends_at = nextMonth.toISOString()
    }
  }

  if (role && ['user', 'admin'].includes(role)) {
    update.role = role
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const { error } = await adminSupabase.from('profiles').update(update).eq('id', user_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
