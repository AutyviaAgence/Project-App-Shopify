import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * DELETE /api/admin/promo-codes/<id>
 *
 * ⚠️ Supprimait aussi le coupon STRIPE associé. Xeyo étant désormais facturé via
 * la Billing API de Shopify, les codes promo ne sont plus que des lignes en base :
 * ils sont traduits en `discount` natif au moment de l'abonnement.
 *
 * ⚠️ La suppression conserve l'historique : `promo_redemptions` référence le code
 * avec `ON DELETE CASCADE`, donc supprimer un code efface aussi la trace de ses
 * utilisations. Pour retirer un code de la circulation sans perdre cet historique,
 * il faut le DÉSACTIVER (PATCH `is_active: false`) — c'est d'ailleurs ce que
 * l'interface prétendait faire (« Code promo désactivé ») alors qu'elle
 * supprimait définitivement.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { id } = await params

  const { error } = await adminSupabase.from('promo_codes').delete().eq('id', id)

  if (error) {
    console.error('[admin/promo-codes] suppression échouée:', error.message)
    return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
