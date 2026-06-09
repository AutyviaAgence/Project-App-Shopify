import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PLAN_TOKEN_LIMITS, type PlanId } from '@/lib/stripe/client'

const VALID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

/** POST /api/admin/activate — Activer manuellement un abonnement (admin only) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier le rôle admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { user_id, plan } = body

  if (!user_id) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  if (plan !== null && !VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'plan doit être starter, pro, scale ou null' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // plan === null → réinitialiser sans abonnement actif
  if (plan === null) {
    const { error: updateError } = await adminSupabase
      .from('profiles')
      .update({ plan: null, tokens_limit: 0, tokens_used: 0, subscription_status: 'none', subscription_ends_at: null })
      .eq('id', user_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, plan: null })
  }

  const now = new Date()
  const nextMonth = new Date(now)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  const { error: updateError } = await adminSupabase
    .from('profiles')
    .update({
      subscription_status: 'active',
      plan,
      tokens_limit: PLAN_TOKEN_LIMITS[plan as PlanId],
      tokens_used: 0,
      token_usage_period_start: now.toISOString(),
      subscription_ends_at: nextMonth.toISOString(),
    })
    .eq('id', user_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Récupérer le nom de l'app depuis le tenant de l'utilisateur
  let appName = 'Xeyo'
  try {
    const { data: profileTenant } = await adminSupabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user_id)
      .single()
    if (profileTenant?.tenant_id) {
      const { data: tenantRow } = await adminSupabase
        .from('tenants' as any)
        .select('app_name')
        .eq('id', profileTenant.tenant_id)
        .single() as unknown as { data: { app_name: string } | null, error: unknown }
      if (tenantRow?.app_name) appName = tenantRow.app_name
    }
  } catch { /* fallback to default */ }

  await adminSupabase.from('user_alerts').insert({
    user_id,
    alert_type: 'info',
    title: 'Abonnement activé',
    message: `Votre abonnement ${plan} a été activé manuellement. Bienvenue sur ${appName} !`,
    metadata: { type: 'manual_activation', plan },
  })

  return NextResponse.json({ success: true, plan, tokens_limit: PLAN_TOKEN_LIMITS[plan as PlanId] })
}
