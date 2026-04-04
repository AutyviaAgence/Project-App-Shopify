import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

/** POST /api/stripe/portal — Créer une session Stripe Customer Portal */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'Aucun compte Stripe associé' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/subscription`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error: any) {
    console.error('[Stripe] Portal session error:', error?.message || error)
    return NextResponse.json({ error: 'Impossible de créer la session de gestion' }, { status: 500 })
  }
}
