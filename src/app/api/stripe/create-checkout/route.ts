import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, SUBSCRIPTION_PRICE_CENTS } from '@/lib/stripe/client'
import { getSubscriptionEndDate } from '@/lib/stripe/helpers'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getTenantFromCookies } from '@/lib/tenant/server'

/** POST /api/stripe/create-checkout — Créer une session Stripe Checkout */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le profil
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }

  try {
    const stripe = getStripe()
    const tenant = await getTenantFromCookies()

    // Créer ou récupérer le client Stripe
    let customerId = profile.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        name: profile.full_name || undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = customer.id

      // Sauvegarder l'ID client Stripe
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Vérifier si le client a déjà un abonnement côté Stripe (actif, trialing ou past_due)
    const existingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 5,
    })

    const activeSub = existingSubscriptions.data.find(
      s => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due'
    )

    if (activeSub) {
      // Abonnement existant côté Stripe — resynchroniser la BDD
      const subscriptionEndsAt = getSubscriptionEndDate(activeSub)

      const adminSupabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      await adminSupabase
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          stripe_subscription_id: activeSub.id,
        })
        .eq('id', user.id)

      return NextResponse.json({
        already_active: true,
        message: 'Abonnement déjà actif, profil resynchronisé.',
      })
    }

    // Créer la session Checkout
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Abonnement ${tenant.appName}`,
              description: `Accès complet à la plateforme ${tenant.appName} - Automatisation WhatsApp IA`,
            },
            unit_amount: SUBSCRIPTION_PRICE_CENTS,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/subscription?success=true`,
      cancel_url: `${baseUrl}/subscription?cancelled=true`,
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe] Error creating checkout session:', error?.message || error)
    const message = error?.message || 'Erreur lors de la création de la session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
