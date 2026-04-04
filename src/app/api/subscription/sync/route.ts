import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { getSubscriptionEndDate } from '@/lib/stripe/helpers'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/** POST /api/subscription/sync — Synchroniser l'abonnement depuis Stripe */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('stripe_customer_id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'Pas de client Stripe associé' }, { status: 404 })
  }

  try {
    const stripe = getStripe()

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      limit: 5,
    })

    const activeSubscription = subscriptions.data.find(
      (sub) => sub.status === 'active' || sub.status === 'trialing'
    )

    if (activeSubscription) {
      const subscriptionEndsAt = getSubscriptionEndDate(activeSubscription)
      const isTrialing = activeSubscription.status === 'trialing'

      await adminSupabase
        .from('profiles')
        .update({
          subscription_status: isTrialing ? 'trial' : 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: activeSubscription.id,
          tokens_limit: isTrialing ? 200000 : 5000000,
        })
        .eq('id', user.id)

      return NextResponse.json({
        data: {
          subscription_status: isTrialing ? 'trial' : 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: activeSubscription.id,
        },
      })
    }

    // No active subscription in Stripe — check if any were canceled
    const canceledSubscription = subscriptions.data.find(
      (sub) => sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'past_due'
    )

    if (canceledSubscription || subscriptions.data.length > 0) {
      // Had a subscription but it's no longer active
      await adminSupabase
        .from('profiles')
        .update({
          subscription_status: 'cancelled',
          stripe_subscription_id: null,
          tokens_limit: 0,
        })
        .eq('id', user.id)

      return NextResponse.json({ data: { subscription_status: 'cancelled' } })
    }

    // Never had a Stripe subscription — keep current status (likely trial)
    return NextResponse.json({ data: { subscription_status: profile.subscription_status } })
  } catch (error) {
    console.error('[Subscription Sync] Error:', error)
    return NextResponse.json({ error: 'Erreur de synchronisation' }, { status: 500 })
  }
}
