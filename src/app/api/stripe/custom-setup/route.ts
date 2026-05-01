import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, CUSTOM_SETUP_INSTALLMENT_CENTS, CUSTOM_BOOKING_URL } from '@/lib/stripe/client'
import { resolvePlan } from '@/lib/stripe/plans'
import { getTenantFromCookies } from '@/lib/tenant/server'

/** POST /api/stripe/custom-setup — Créer une session Stripe pour acompte setup Custom (445€) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const plan = resolvePlan(body.plan)

  try {
    const stripe = getStripe()
    const tenant = await getTenantFromCookies()

    let customerId = profile.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        name: profile.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Vérifier combien d'acomptes ont déjà été payés
    const existingPayments = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 10,
    })

    const paidInstallments = existingPayments.data.filter(
      s => s.status === 'complete' && s.metadata?.type === 'custom_setup'
    ).length

    if (paidInstallments >= 2) {
      return NextResponse.json({
        error: 'Les 2 acomptes ont déjà été réglés.',
        booking_url: CUSTOM_BOOKING_URL,
      }, { status: 400 })
    }

    const installmentNumber = paidInstallments + 1
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Setup Custom ${tenant.appName} — Acompte ${installmentNumber}/2`,
              description: `Acompte ${installmentNumber}/2 pour la mise en place personnalisée (intégrations CRM, e-commerce, workflows sur mesure)`,
            },
            unit_amount: CUSTOM_SETUP_INSTALLMENT_CENTS,
          },
          quantity: 1,
        },
      ],
      success_url: installmentNumber === 1
        ? `${baseUrl}/onboarding/configurateur?acompte=ok`
        : `${baseUrl}/onboarding/solde?solde=ok`,
      cancel_url: `${baseUrl}/onboarding`,
      metadata: {
        user_id: user.id,
        type: 'custom_setup',
        installment: installmentNumber.toString(),
        plan,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe] Error creating custom setup session:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur' }, { status: 500 })
  }
}
