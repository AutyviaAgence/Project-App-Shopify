import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { getSubscriptionEndDate } from '@/lib/stripe/helpers'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import type Stripe from 'stripe'

// Stripe v20+ a supprimé subscription/payment_intent de Invoice,
// mais les webhooks les envoient toujours dans le payload.
type InvoiceWithLegacy = Stripe.Invoice & {
  subscription?: string | null
  payment_intent?: string | null
}

/** Get tenant app name for a user (for dynamic branding in alerts) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTenantAppName(supabase: any, userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single() as { data: { tenant_id: string | null } | null }
    if (data?.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('app_name')
        .eq('id', data.tenant_id)
        .single() as { data: { app_name: string } | null }
      if (tenant?.app_name) return tenant.app_name
    }
  } catch { /* fallback */ }
  return 'Autyvia'
}

export async function POST(req: NextRequest) {
  // Rate limit webhook endpoint
  const rateLimitResponse = checkRateLimit(req, 'WEBHOOK')
  if (rateLimitResponse) return rateLimitResponse

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
        console.log('[Stripe Webhook] checkout.session.completed - mode:', session.mode, 'subscription:', session.subscription)

        // Achat de tokens supplémentaires (mode payment)
        if (session.mode === 'payment' && session.metadata?.type === 'token_purchase') {
          const userId = session.metadata?.user_id
          const tokensToAdd = parseInt(session.metadata?.tokens || '500000', 10)

          if (userId) {
            // Incrémenter la limite de tokens
            const { data: profile } = await supabase
              .from('profiles')
              .select('tokens_limit')
              .eq('id', userId)
              .single()

            if (profile) {
              await supabase
                .from('profiles')
                .update({ tokens_limit: profile.tokens_limit + tokensToAdd })
                .eq('id', userId)
            }

            // Enregistrer le paiement
            await supabase.from('payment_history').insert({
              user_id: userId,
              amount: session.amount_total || 5000,
              currency: session.currency || 'eur',
              status: 'succeeded',
              stripe_payment_intent_id: session.payment_intent as string || null,
              description: `Achat de ${tokensToAdd.toLocaleString()} tokens IA`,
              metadata: {
                checkout_session_id: session.id,
                type: 'token_purchase',
                tokens: tokensToAdd,
              },
            })

            await supabase.from('user_alerts').insert({
              user_id: userId,
              alert_type: 'info',
              title: 'Tokens ajoutés',
              message: `${tokensToAdd.toLocaleString()} tokens IA ont été ajoutés à votre compte.`,
              metadata: { type: 'token_purchase', tokens: tokensToAdd },
            })

            console.log('[Stripe Webhook] Token purchase completed for user:', userId, '+', tokensToAdd)
          }
          break
        }

        if (session.mode === 'subscription' && session.subscription) {
          const stripe = getStripe()
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string) as Stripe.Subscription

          // Essayer plusieurs sources pour le user_id
          const userId = subscription.metadata?.user_id
            || session.metadata?.user_id
            || null

          // Fallback: chercher via le customer Stripe
          let resolvedUserId = userId
          if (!resolvedUserId && session.customer) {
            const customer = await stripe.customers.retrieve(session.customer as string) as Stripe.Customer
            const supabaseUserId = customer.metadata?.supabase_user_id
            if (supabaseUserId) {
              resolvedUserId = supabaseUserId
            } else {
              // Dernier fallback: chercher par stripe_customer_id dans la BDD
              const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', session.customer as string)
                .single()
              if (profile) resolvedUserId = profile.id
            }
          }

          console.log('[Stripe Webhook] Resolved user_id:', resolvedUserId)

          if (resolvedUserId) {
            const subscriptionEndsAt = getSubscriptionEndDate(subscription)
            const isTrialing = subscription.status === 'trialing'

            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                subscription_status: isTrialing ? 'trial' : 'active',
                subscription_ends_at: subscriptionEndsAt.toISOString(),
                trial_ends_at: isTrialing && subscription.trial_end
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : undefined,
                stripe_subscription_id: subscription.id,
                tokens_used: 0,
                tokens_limit: isTrialing ? 200000 : 5000000,
                token_usage_period_start: new Date().toISOString(),
              })
              .eq('id', resolvedUserId)

            if (updateError) {
              console.error('[Stripe Webhook] Error updating profile:', updateError)
            } else {
              console.log('[Stripe Webhook] Profile updated successfully for user:', resolvedUserId)
            }

            // Enregistrer le paiement
            await supabase.from('payment_history').insert({
              user_id: resolvedUserId,
              amount: session.amount_total || 15000,
              currency: session.currency || 'eur',
              status: 'succeeded',
              stripe_payment_intent_id: session.payment_intent as string || null,
              description: `Abonnement ${await getTenantAppName(supabase, resolvedUserId)} - Mensuel`,
              metadata: {
                checkout_session_id: session.id,
                subscription_id: subscription.id,
              },
            })

            // Créer une alerte pour l'utilisateur
            await supabase.from('user_alerts').insert({
              user_id: resolvedUserId,
              alert_type: 'info',
              title: isTrialing ? 'Essai gratuit activé' : 'Abonnement activé',
              message: isTrialing
                ? `Votre essai gratuit de 14 jours a démarré. Vous ne serez débité que le ${subscriptionEndsAt.toLocaleDateString('fr-FR')} si vous ne résiliez pas avant.`
                : `Votre abonnement a été activé. Prochain renouvellement le ${subscriptionEndsAt.toLocaleDateString('fr-FR')}.`,
              metadata: {
                type: isTrialing ? 'trial_started' : 'subscription_created',
                amount: session.amount_total,
              },
            })

            console.log('[Stripe Webhook] Subscription created for user:', resolvedUserId, isTrialing ? '(trial)' : '(active)')
          } else {
            console.error('[Stripe Webhook] Could not resolve user_id for session:', session.id)
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        // Renouvellement d'abonnement réussi
        const invoice = event.data.object as InvoiceWithLegacy
        const subscriptionId = invoice.subscription as string

        if (subscriptionId && invoice.billing_reason === 'subscription_cycle') {
          const stripe = getStripe()
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription
          const userId = subscription.metadata?.user_id

          if (userId) {
            const subscriptionEndsAt = getSubscriptionEndDate(subscription)

            await supabase
              .from('profiles')
              .update({
                subscription_status: 'active',
                subscription_ends_at: subscriptionEndsAt.toISOString(),
                tokens_used: 0,
                token_usage_period_start: new Date().toISOString(),
              })
              .eq('id', userId)

            await supabase.from('payment_history').insert({
              user_id: userId,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
              stripe_payment_intent_id: invoice.payment_intent as string || null,
              description: `Renouvellement abonnement ${await getTenantAppName(supabase, userId)}`,
              metadata: {
                invoice_id: invoice.id,
                subscription_id: subscriptionId,
              },
            })

            await supabase.from('user_alerts').insert({
              user_id: userId,
              alert_type: 'info',
              title: 'Abonnement renouvelé',
              message: `Votre abonnement a été renouvelé. Prochain renouvellement le ${subscriptionEndsAt.toLocaleDateString('fr-FR')}.`,
              metadata: {
                type: 'subscription_renewed',
                amount: invoice.amount_paid,
              },
            })

            console.log('[Stripe Webhook] Subscription renewed for user:', userId)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        // Échec de paiement d'abonnement
        const invoice = event.data.object as InvoiceWithLegacy
        const subscriptionId = invoice.subscription as string

        if (subscriptionId) {
          const stripe = getStripe()
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription
          const userId = subscription.metadata?.user_id

          if (userId) {
            await supabase.from('payment_history').insert({
              user_id: userId,
              amount: invoice.amount_due,
              currency: invoice.currency,
              status: 'failed',
              stripe_payment_intent_id: invoice.payment_intent as string || null,
              description: 'Échec renouvellement abonnement',
              metadata: {
                invoice_id: invoice.id,
                subscription_id: subscriptionId,
              },
            })

            await supabase.from('user_alerts').insert({
              user_id: userId,
              alert_type: 'webhook_error',
              title: 'Échec de paiement',
              message: 'Le renouvellement de votre abonnement a échoué. Veuillez mettre à jour votre moyen de paiement.',
              metadata: {
                type: 'payment_failed',
                invoice_id: invoice.id,
              },
            })

            console.log('[Stripe Webhook] Payment failed for user:', userId)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        // Abonnement annulé
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.user_id

        if (userId) {
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'cancelled',
              stripe_subscription_id: null,
            })
            .eq('id', userId)

          await supabase.from('user_alerts').insert({
            user_id: userId,
            alert_type: 'warning',
            title: 'Abonnement annulé',
            message: 'Votre abonnement a été annulé. Vous pouvez vous réabonner à tout moment.',
            metadata: {
              type: 'subscription_cancelled',
            },
          })

          console.log('[Stripe Webhook] Subscription cancelled for user:', userId)
        }
        break
      }

      case 'customer.subscription.updated': {
        // Mise à jour d'abonnement (changement de statut, etc.)
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.user_id

        if (userId) {
          const subscriptionEndsAt = getSubscriptionEndDate(subscription)
          let status: 'trial' | 'active' | 'cancelled' | 'expired' = 'active'

          if (subscription.status === 'trialing') {
            status = 'trial'
          } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
            status = 'cancelled'
          } else if (subscription.status === 'past_due') {
            status = 'expired'
          }

          const updateData: Record<string, unknown> = {
            subscription_status: status,
            subscription_ends_at: subscriptionEndsAt.toISOString(),
          }

          // When trial ends and subscription becomes active, upgrade tokens
          if (subscription.status === 'active') {
            updateData.tokens_limit = 5000000
            updateData.tokens_used = 0
            updateData.token_usage_period_start = new Date().toISOString()
          }

          await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId)

          console.log('[Stripe Webhook] Subscription updated for user:', userId, 'status:', status)
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
