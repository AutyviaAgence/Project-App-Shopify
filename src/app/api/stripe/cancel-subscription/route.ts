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

    // Check if subscription is in trial — if so, cancel immediately (no charge)
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    const isTrialing = subscription.status === 'trialing'

    let result
    if (isTrialing) {
      // Immediate cancellation during trial — user is never charged
      result = await stripe.subscriptions.cancel(profile.stripe_subscription_id)
      console.log('[Stripe] Trial subscription cancelled immediately for user:', user.id)
    } else {
      // Cancel at end of billing period for paid subscriptions
      result = await stripe.subscriptions.update(profile.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      console.log('[Stripe] Subscription set to cancel at period end for user:', user.id)
    }

    // If immediate cancel during trial, update profile now
    if (isTrialing) {
      const adminSupabase = (await import('@supabase/supabase-js')).createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await adminSupabase
        .from('profiles')
        .update({
          subscription_status: 'cancelled',
          stripe_subscription_id: null,
          tokens_limit: 0,
        })
        .eq('id', user.id)
    }

    return NextResponse.json({
      ok: true,
      immediate: isTrialing,
      cancel_at: result.cancel_at
        ? new Date(result.cancel_at * 1000).toISOString()
        : null,
    })
  } catch (error) {
    console.error('[Stripe] Cancel subscription error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'annulation' }, { status: 500 })
  }
}
