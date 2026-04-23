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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id) as any

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json({ error: 'Abonnement non actif' }, { status: 400 })
    }

    const itemId = subscription.items.data[0]?.id
    if (!itemId) {
      return NextResponse.json({ error: 'Item abonnement introuvable' }, { status: 400 })
    }

    const newPriceId = PLAN_PRICE_IDS[newPlan]

    // Planifier le changement au prochain renouvellement (sans prorata ni facture immédiate)
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'none',
      metadata: { plan: newPlan, user_id: user.id },
    })

    // Stocker le plan prévu dans la BDD sans l'appliquer encore
    const renewalDate = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await admin
      .from('profiles')
      .update({ pending_plan: newPlan })
      .eq('id', user.id)

    await admin.from('user_alerts').insert({
      user_id: user.id,
      alert_type: 'info',
      title: 'Changement de plan planifié',
      message: `Votre plan passera au ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} à votre prochain renouvellement${renewalDate ? ` le ${renewalDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Votre plan actuel reste actif jusqu'à cette date.`,
      metadata: { type: 'plan_change_scheduled', old_plan: profile.plan, new_plan: newPlan, effective_date: renewalDate?.toISOString() ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Stripe] Error changing plan:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur lors du changement de plan' }, { status: 500 })
  }
}
