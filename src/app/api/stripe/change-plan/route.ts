import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getStripe, PLAN_PRICE_IDS, PLAN_TOKEN_LIMITS } from '@/lib/stripe/client'
import type { PlanId } from '@/lib/stripe/plans'

const VALID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

/** POST /api/stripe/change-plan — Changer de plan sans recréer un abonnement */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const newPlan: PlanId = VALID_PLANS.includes(body.plan) ? body.plan : null
  if (!newPlan) {
    return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, plan')
    .eq('id', user.id)
    .single() as { data: { stripe_subscription_id: string | null; plan: string | null } | null }

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Aucun abonnement actif trouvé' }, { status: 400 })
  }

  if (profile.plan === newPlan) {
    return NextResponse.json({ error: 'Vous êtes déjà sur ce plan' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json({ error: 'Abonnement non actif' }, { status: 400 })
    }

    const itemId = subscription.items.data[0]?.id
    if (!itemId) {
      return NextResponse.json({ error: 'Item abonnement introuvable' }, { status: 400 })
    }

    const newPriceId = PLAN_PRICE_IDS[newPlan]

    // Modifier l'abonnement immédiatement avec proratisation
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'always_invoice',
      metadata: { plan: newPlan, user_id: user.id },
    })

    // Mettre à jour la BDD immédiatement
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await admin
      .from('profiles')
      .update({
        plan: newPlan,
        tokens_limit: PLAN_TOKEN_LIMITS[newPlan],
        tokens_used: 0,
        token_usage_period_start: new Date().toISOString(),
      })
      .eq('id', user.id)

    await admin.from('user_alerts').insert({
      user_id: user.id,
      alert_type: 'info',
      title: 'Plan modifié',
      message: `Votre abonnement a été changé vers le plan ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)}. La différence est calculée au prorata.`,
      metadata: { type: 'plan_changed', old_plan: profile.plan, new_plan: newPlan },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Stripe] Error changing plan:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur lors du changement de plan' }, { status: 500 })
  }
}
