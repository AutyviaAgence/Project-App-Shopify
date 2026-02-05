import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/** POST /api/subscription/sync — Synchroniser l'abonnement depuis Stripe */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'Pas de client Stripe associé' }, { status: 404 })
  }

  try {
    const stripe = getStripe()

    // Récupérer les abonnements actifs du client
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0]
      const subscriptionEndsAt = new Date((subscription as any).current_period_end * 1000)

      // Utiliser le client admin pour bypasser RLS
      const adminSupabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      await adminSupabase
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: subscription.id,
        })
        .eq('id', user.id)

      return NextResponse.json({
        data: {
          subscription_status: 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: subscription.id,
        },
      })
    }

    return NextResponse.json({ data: { subscription_status: profile.subscription_status } })
  } catch (error) {
    console.error('[Subscription Sync] Error:', error)
    return NextResponse.json({ error: 'Erreur de synchronisation' }, { status: 500 })
  }
}
