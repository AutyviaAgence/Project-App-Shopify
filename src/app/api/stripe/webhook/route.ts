import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Utiliser le client admin pour bypasser RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('[Stripe Webhook] Event:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id

        if (userId) {
          // Activer l'abonnement (1 mois)
          const subscriptionEndsAt = new Date()
          subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1)

          await supabase
            .from('profiles')
            .update({
              subscription_status: 'active',
              subscription_ends_at: subscriptionEndsAt.toISOString(),
            })
            .eq('id', userId)

          // Enregistrer le paiement
          await supabase.from('payment_history').insert({
            user_id: userId,
            amount: session.amount_total || 15000,
            currency: session.currency || 'eur',
            status: 'succeeded',
            stripe_payment_intent_id: session.payment_intent as string,
            description: 'Abonnement Autyvia - 1 mois',
            metadata: {
              checkout_session_id: session.id,
            },
          })

          // Créer une alerte pour l'utilisateur
          await supabase.from('user_alerts').insert({
            user_id: userId,
            alert_type: 'info',
            title: 'Paiement réussi',
            message: `Votre abonnement Autyvia a été activé. Il sera valide jusqu'au ${subscriptionEndsAt.toLocaleDateString('fr-FR')}.`,
            metadata: {
              type: 'payment_success',
              amount: session.amount_total,
            },
          })

          console.log('[Stripe Webhook] Subscription activated for user:', userId)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const customerId = paymentIntent.customer as string

        if (customerId) {
          // Trouver l'utilisateur par stripe_customer_id
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (profile) {
            await supabase.from('payment_history').insert({
              user_id: profile.id,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
              status: 'failed',
              stripe_payment_intent_id: paymentIntent.id,
              description: 'Paiement échoué',
              metadata: {
                error: paymentIntent.last_payment_error?.message,
              },
            })

            await supabase.from('user_alerts').insert({
              user_id: profile.id,
              alert_type: 'webhook_error',
              title: 'Paiement échoué',
              message: `Votre paiement a échoué. Raison : ${paymentIntent.last_payment_error?.message || 'Erreur inconnue'}`,
              metadata: {
                type: 'payment_failed',
                error: paymentIntent.last_payment_error?.message,
              },
            })
          }
        }
        break
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Stripe Webhook] Error processing event:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
