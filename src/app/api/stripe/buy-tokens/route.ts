import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { getTenantFromCookies } from '@/lib/tenant/server'

const TOKEN_PRICE_CENTS = 5000 // 50€
const TOKEN_AMOUNT = 500000

/** POST /api/stripe/buy-tokens — Créer une session Stripe pour achat de tokens */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // ⚠️ CONFORMITÉ SHOPIFY : achats ponctuels via Stripe interdits pour un marchand
  // facturé par Shopify (cf. buy-ai-credits). Ils montent de plan à la place.
  {
    const { isShopifyBilled } = await import('@/lib/shopify/plans')
    if (await isShopifyBilled(user.id)) {
      return NextResponse.json({
        error: 'Les achats ponctuels ne sont pas disponibles sur Shopify. Passez au plan supérieur depuis l’app Shopify.',
        shopify_billing: true,
      }, { status: 403 })
    }
  }

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
              name: '500 000 tokens IA',
              description: `Tokens supplémentaires pour l'IA ${tenant.appName}`,
            },
            unit_amount: TOKEN_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/subscription?tokens_success=true`,
      cancel_url: `${baseUrl}/settings?tokens_cancelled=true`,
      metadata: {
        user_id: user.id,
        type: 'token_purchase',
        tokens: TOKEN_AMOUNT.toString(),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Stripe] Error creating token purchase session:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur' }, { status: 500 })
  }
}
