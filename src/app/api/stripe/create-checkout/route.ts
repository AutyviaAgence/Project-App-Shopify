import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, PLAN_PRICE_IDS, PLAN_PRICES_EUR, type PlanId } from '@/lib/stripe/client'
import { getSubscriptionEndDate } from '@/lib/stripe/helpers'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getTenantFromCookies } from '@/lib/tenant/server'

const VALID_PLANS: PlanId[] = ['starter', 'pro', 'scale']

/** POST /api/stripe/create-checkout — Créer une session Stripe Checkout */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const plan: PlanId = VALID_PLANS.includes(body.plan) ? body.plan : 'scale'
  const promoCodeInput: string | undefined = body.promo_code?.toString().toUpperCase()
  const affiliateCodeInput: string | undefined = body.affiliate_code?.toString().toUpperCase()

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

    // Vérifier tous les abonnements Stripe du client (actifs ET passés)
    const [activeSubsRes, canceledSubsRes] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 }),
      stripe.subscriptions.list({ customer: customerId, status: 'canceled', limit: 10 }),
    ])

    const allSubs = [...activeSubsRes.data, ...canceledSubsRes.data]
    const activeSub = allSubs.find(
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

    // Trial uniquement pour les nouveaux clients sans historique d'abonnement
    const hasHadSubscriptionBefore = allSubs.length > 0
    const trialDays = hasHadSubscriptionBefore ? undefined : 7

    // Résoudre le code promo en ID Stripe si fourni
    let stripePromoCodeId: string | undefined
    if (promoCodeInput) {
      try {
        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: promoRow } = await adminSupabase
          .from('promo_codes')
          .select('stripe_promo_code_id, applies_to, is_active')
          .eq('code', promoCodeInput)
          .single() as { data: { stripe_promo_code_id: string | null; applies_to: string; is_active: boolean } | null }

        if (promoRow?.is_active && promoRow.stripe_promo_code_id &&
            (promoRow.applies_to === 'subscription' || promoRow.applies_to === 'both')) {
          stripePromoCodeId = promoRow.stripe_promo_code_id
        }
      } catch { /* promo code not found, continue without */ }
    }

    // Créer la session Checkout
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const priceId = PLAN_PRICE_IDS[plan]
    const planNames: Record<PlanId, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: any = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/subscription?success=true`,
      cancel_url: `${baseUrl}/subscription?cancelled=true`,
      metadata: {
        user_id: user.id,
        plan,
        ...(affiliateCodeInput ? { affiliate_code: affiliateCodeInput } : {}),
      },
      subscription_data: {
        ...(trialDays ? { trial_period_days: trialDays } : {}),
        metadata: {
          user_id: user.id,
          plan,
          ...(affiliateCodeInput ? { affiliate_code: affiliateCodeInput } : {}),
        },
      },
      custom_text: {
        submit: {
          message: `Plan ${planNames[plan]} — ${PLAN_PRICES_EUR[plan]}€/mois. Vous acceptez les CGV d'${tenant.appName}.`,
        },
      },
      ...(stripePromoCodeId
        ? { discounts: [{ promotion_code: stripePromoCodeId }] }
        : { allow_promotion_codes: true }),
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe] Error creating checkout session:', error?.message || error)
    const message = error?.message || 'Erreur lors de la création de la session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
