import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PLAN_TOKEN_LIMITS, resolvePlan } from '@/lib/stripe/client'
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

/** Distribute 500k tokens to referrer + referee on first real payment */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function distributeReferralRewards(
  supabase: any,
  userId: string,
  triggerEvent: 'subscription' | 'audit'
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('referred_by')
      .eq('id', userId)
      .single() as { data: { referred_by: string | null } | null }

    if (!profile?.referred_by) return

    const referrerId = profile.referred_by

    // Check if reward already exists for this pair + event
    const { data: existing } = await supabase
      .from('referral_rewards')
      .select('id')
      .eq('referrer_id', referrerId)
      .eq('referee_id', userId)
      .eq('trigger_event', triggerEvent)
      .maybeSingle()

    if (existing) return

    const TOKENS = 500_000

    // Credit tokens to both
    for (const recipientId of [referrerId, userId]) {
      const { data: p } = await supabase
        .from('profiles')
        .select('tokens_extra')
        .eq('id', recipientId)
        .single() as { data: { tokens_extra: number | null } | null }

      await supabase
        .from('profiles')
        .update({ tokens_extra: (p?.tokens_extra || 0) + TOKENS })
        .eq('id', recipientId)

      await supabase.from('user_alerts').insert({
        user_id: recipientId,
        alert_type: 'info',
        title: '🎁 Bonus parrainage reçu !',
        message: `500 000 tokens ont été ajoutés à votre compte grâce au parrainage.`,
        metadata: { type: 'referral_reward', trigger: triggerEvent, tokens: TOKENS },
      })
    }

    // Record the reward
    await supabase.from('referral_rewards').insert([
      { referrer_id: referrerId, referee_id: userId, rewarded_user_id: referrerId, tokens_credited: TOKENS, trigger_event: triggerEvent },
      { referrer_id: referrerId, referee_id: userId, rewarded_user_id: userId, tokens_credited: TOKENS, trigger_event: triggerEvent },
    ])

    console.log('[Referral] Rewards distributed for referrer:', referrerId, 'referee:', userId)
  } catch (err) {
    console.error('[Referral] Error distributing rewards:', err)
  }
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

        // Paiement setup onboarding (acompte 1 ou solde 2)
        if (session.mode === 'payment' && session.metadata?.type === 'custom_setup') {
          const userId = session.metadata?.user_id
          const installment = parseInt(session.metadata?.installment || '1', 10)
          const plan = resolvePlan(session.metadata?.plan)

          if (userId) {
            if (installment === 1) {
              // Acompte J0 → accès complet immédiat avec tokens du plan choisi (période audit)
              await supabase
                .from('profiles')
                .update({
                  audit_status: 'acompte_paid',
                  onboarding_plan: plan,
                  subscription_status: 'active',
                  plan,
                  tokens_limit: PLAN_TOKEN_LIMITS[plan],
                  tokens_used: 0,
                  token_usage_period_start: new Date().toISOString(),
                })
                .eq('id', userId)

              await supabase.from('user_alerts').insert({
                user_id: userId,
                alert_type: 'info',
                title: 'Acompte reçu — accès complet activé',
                message: `Votre acompte de 445€ a été reçu. Vous avez accès à la plateforme avec le plan ${plan} pendant la période de mise en place.`,
                metadata: { type: 'setup_installment_1', plan },
              })
            } else if (installment === 2) {
              // Solde J30 → audit livré, l'abonnement mensuel sera démarré
              // via un checkout Stripe séparé côté client après cette redirection.
              const planId = resolvePlan(session.metadata?.plan)
              await supabase
                .from('profiles')
                .update({
                  audit_status: 'solde_paid',
                  plan: planId,
                })
                .eq('id', userId)

              await supabase.from('user_alerts').insert({
                user_id: userId,
                alert_type: 'info',
                title: 'Solde reçu — démarrez votre abonnement',
                message: `Votre setup est finalisé. Rendez-vous sur /onboarding/solde pour démarrer votre abonnement ${planId}.`,
                metadata: { type: 'setup_installment_2', plan: planId },
              })
            }

            await supabase.from('payment_history').insert({
              user_id: userId,
              amount: session.amount_total || 44500,
              currency: session.currency || 'eur',
              status: 'succeeded',
              stripe_payment_intent_id: session.payment_intent as string || null,
              description: `Mise en place Autyvia — ${installment === 1 ? 'Acompte' : 'Solde'} (445€)`,
              metadata: { checkout_session_id: session.id, type: 'custom_setup', installment },
            })

            // Distribute referral rewards on first installment
            if (installment === 1) {
              await distributeReferralRewards(supabase, userId, 'audit')
            }

            console.log('[Stripe Webhook] custom_setup installment', installment, 'for user:', userId)
          }
          break
        }

        // Achat de tokens supplémentaires (mode payment)
        if (session.mode === 'payment' && session.metadata?.type === 'token_purchase') {
          const userId = session.metadata?.user_id
          const tokensToAdd = parseInt(session.metadata?.tokens || '500000', 10)

          if (userId) {
            // Créditer la balance séparée tokens_extra (ne se réinitialise pas chaque mois)
            const { data: profile } = await supabase
              .from('profiles')
              .select('tokens_extra')
              .eq('id', userId)
              .single()

            if (profile) {
              await supabase
                .from('profiles')
                .update({ tokens_extra: (profile.tokens_extra || 0) + tokensToAdd })
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
            const plan = resolvePlan((subscription.metadata?.plan || session.metadata?.plan) as string | undefined)
            const tokensLimit = isTrialing ? 200_000 : PLAN_TOKEN_LIMITS[plan]

            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                subscription_status: isTrialing ? 'trialing' : 'active',
                subscription_ends_at: subscriptionEndsAt.toISOString(),
                trial_ends_at: isTrialing && subscription.trial_end
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : undefined,
                stripe_subscription_id: subscription.id,
                tokens_used: 0,
                tokens_limit: tokensLimit,
                token_usage_period_start: new Date().toISOString(),
                plan,
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
                ? `Votre semaine gratuite a démarré. Vous ne serez débité que le ${subscriptionEndsAt.toLocaleDateString('fr-FR')} si vous ne résiliez pas avant.`
                : `Votre abonnement a été activé. Prochain renouvellement le ${subscriptionEndsAt.toLocaleDateString('fr-FR')}.`,
              metadata: {
                type: isTrialing ? 'trial_started' : 'subscription_created',
                amount: session.amount_total,
              },
            })

            // Distribute referral rewards only on first real payment (not trial start)
            if (!isTrialing) {
              await distributeReferralRewards(supabase, resolvedUserId, 'subscription')
            }

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

        // Trial → paid conversion: distribute referral rewards
        if (subscriptionId && invoice.billing_reason === 'subscription_create') {
          const stripe = getStripe()
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription
          const userId = subscription.metadata?.user_id
          if (userId) {
            await distributeReferralRewards(supabase, userId, 'subscription')
          }
        }

        if (subscriptionId && invoice.billing_reason === 'subscription_cycle') {
          const stripe = getStripe()
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription
          const userId = subscription.metadata?.user_id

          if (userId) {
            const subscriptionEndsAt = getSubscriptionEndDate(subscription)
            const plan = resolvePlan(subscription.metadata?.plan as string | undefined)

            await supabase
              .from('profiles')
              .update({
                subscription_status: 'active',
                subscription_ends_at: subscriptionEndsAt.toISOString(),
                tokens_used: 0,
                tokens_limit: PLAN_TOKEN_LIMITS[plan],
                token_usage_period_start: new Date().toISOString(),
                plan,
                pending_plan: null,
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
            // Block access: set status to past_due and tokens to 0
            await supabase
              .from('profiles')
              .update({
                subscription_status: 'past_due',
                tokens_limit: 0,
              })
              .eq('id', userId)

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
              message: 'Le renouvellement de votre abonnement a échoué. Votre accès est suspendu. Veuillez mettre à jour votre moyen de paiement.',
              metadata: {
                type: 'payment_failed',
                invoice_id: invoice.id,
              },
            })

            console.log('[Stripe Webhook] Payment failed — access suspended for user:', userId)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        // Abonnement annulé — conserver subscription_ends_at pour accès jusqu'à fin de période
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.user_id

        if (userId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const subAny = subscription as any
          const endsAt = subAny.current_period_end
            ? new Date(subAny.current_period_end * 1000).toISOString()
            : null

          await supabase
            .from('profiles')
            .update({
              subscription_status: 'canceled',
              stripe_subscription_id: null,
              pending_plan: null,
              ...(endsAt ? { subscription_ends_at: endsAt } : {}),
            })
            .eq('id', userId)

          await supabase.from('user_alerts').insert({
            user_id: userId,
            alert_type: 'warning',
            title: 'Abonnement annulé',
            message: endsAt
              ? `Votre abonnement a été annulé. Vous conservez l'accès jusqu'au ${new Date(endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : 'Votre abonnement a été annulé. Vous pouvez vous réabonner à tout moment.',
            metadata: { type: 'subscription_cancelled', ends_at: endsAt },
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
          let status: 'trialing' | 'active' | 'canceled' | 'past_due' = 'active'

          if (subscription.status === 'trialing') {
            status = 'trialing'
          } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
            status = 'canceled'
          } else if (subscription.status === 'past_due') {
            status = 'past_due'
          }

          const updateData: Record<string, unknown> = {
            subscription_status: status,
            subscription_ends_at: subscriptionEndsAt.toISOString(),
          }

          // When trial ends and subscription becomes active, upgrade tokens to plan limit
          if (subscription.status === 'active') {
            const plan = resolvePlan(subscription.metadata?.plan as string | undefined)
            updateData.tokens_limit = PLAN_TOKEN_LIMITS[plan]
            updateData.tokens_used = 0
            updateData.token_usage_period_start = new Date().toISOString()
            updateData.plan = plan
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
