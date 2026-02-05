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

  // Utiliser le client admin pour lire et écrire sans RLS
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('stripe_customer_id, subscription_status')
    .eq('id', user.id)
    .single()

  console.log('[Subscription Sync] Profile:', user.id, 'stripe_customer_id:', profile?.stripe_customer_id)

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'Pas de client Stripe associé' }, { status: 404 })
  }

  try {
    const stripe = getStripe()

    // Récupérer tous les abonnements du client (actifs, trialing, etc.)
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      limit: 5,
    })

    console.log('[Subscription Sync] Found', subscriptions.data.length, 'subscriptions')
    subscriptions.data.forEach((sub, i) => {
      console.log(`[Subscription Sync] Sub ${i}:`, sub.id, 'status:', sub.status)
    })

    // Chercher un abonnement actif ou trialing
    const activeSubscription = subscriptions.data.find(
      (sub) => sub.status === 'active' || sub.status === 'trialing'
    )

    if (activeSubscription) {
      const subscriptionEndsAt = new Date((activeSubscription as any).current_period_end * 1000)

      const { error: updateError } = await adminSupabase
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: activeSubscription.id,
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('[Subscription Sync] Update error:', updateError)
      } else {
        console.log('[Subscription Sync] Profile updated to active for user:', user.id)
      }

      return NextResponse.json({
        data: {
          subscription_status: 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: activeSubscription.id,
        },
      })
    }

    console.log('[Subscription Sync] No active subscription found for customer:', profile.stripe_customer_id)
    return NextResponse.json({ data: { subscription_status: profile.subscription_status } })
  } catch (error) {
    console.error('[Subscription Sync] Error:', error)
    return NextResponse.json({ error: 'Erreur de synchronisation' }, { status: 500 })
  }
}
