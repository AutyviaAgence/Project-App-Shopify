import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = await createAdminClient()

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { id } = await params

  const { data: promoCode } = await (adminSupabase as any)
    .from('promo_codes')
    .select('stripe_promo_code_id')
    .eq('id', id)
    .single() as { data: { stripe_promo_code_id: string | null } | null }

  if (!promoCode) return NextResponse.json({ error: 'Code introuvable' }, { status: 404 })

  try {
    const stripe = getStripe()

    if (promoCode.stripe_promo_code_id) {
      await stripe.promotionCodes.update(promoCode.stripe_promo_code_id, { active: false })
    }

    await (adminSupabase as any)
      .from('promo_codes')
      .update({ is_active: false })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erreur' }, { status: 500 })
  }
}
