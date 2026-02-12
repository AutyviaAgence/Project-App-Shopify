import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

/** POST /api/stripe/cancel-subscription — Annuler l'abonnement à la fin de la période */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Aucun abonnement actif' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    // Annuler à la fin de la période de facturation (pas immédiatement)
    const subscription = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    console.log('[Stripe] Subscription set to cancel at period end for user:', user.id)

    return NextResponse.json({
      ok: true,
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
    })
  } catch (error) {
    console.error('[Stripe] Cancel subscription error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'annulation' }, { status: 500 })
  }
}
