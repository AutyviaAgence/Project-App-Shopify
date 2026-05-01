import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe/client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { data } = await adminSupabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { code, discount_percent, max_redemptions, applies_to } = body

  if (!code || !discount_percent) {
    return NextResponse.json({ error: 'Code et remise requis' }, { status: 400 })
  }

  try {
    const stripe = getStripe()

    const coupon = await stripe.coupons.create({
      percent_off: Number(discount_percent),
      duration: 'once',
      name: `Promo ${code}`,
    })

    // max_redemptions appartient au promotion code, pas au coupon
    const promoCodeParams: any = {
      coupon: coupon.id,
      code: code.toUpperCase(),
      ...(max_redemptions ? { max_redemptions: Number(max_redemptions) } : {}),
    }
    const stripePromoCode = await stripe.promotionCodes.create(promoCodeParams)

    const { data, error } = await adminSupabase
      .from('promo_codes')
      .insert({
        code: code.toUpperCase(),
        stripe_coupon_id: coupon.id,
        stripe_promo_code_id: stripePromoCode.id,
        discount_percent: Number(discount_percent),
        max_redemptions: max_redemptions ? Number(max_redemptions) : null,
        applies_to: applies_to || 'both',
        is_active: true,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erreur Stripe' }, { status: 500 })
  }
}
