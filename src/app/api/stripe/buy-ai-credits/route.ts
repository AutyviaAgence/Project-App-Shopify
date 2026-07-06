import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { getTenantFromCookies } from '@/lib/tenant/server'

// Pack de recharge : 500 conversations IA pour 45€ (crédits qui NE PÉRIMENT PAS).
export const AI_CREDITS_PACK = 500
export const AI_CREDITS_PRICE_CENTS = 4500

/** POST /api/stripe/buy-ai-credits — Achète un pack de conversations IA. */
export async function POST() {
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
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
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
              name: `${AI_CREDITS_PACK} conversations IA`,
              description: `Crédits IA supplémentaires ${tenant.appName} (ne périment pas)`,
            },
            unit_amount: AI_CREDITS_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/subscription?credits_success=true`,
      cancel_url: `${baseUrl}/subscription?credits_cancelled=true`,
      metadata: {
        user_id: user.id,
        type: 'ai_credits_purchase',
        credits: AI_CREDITS_PACK.toString(),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur'
    console.error('[Stripe] Error creating AI credits session:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
