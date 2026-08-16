import { NextResponse } from 'next/server'
import { getScopedClient } from '@/lib/admin/impersonation'

/**
 * GET /api/shopify/products
 * Liste les produits synchronisés de la boutique de l'utilisateur (titre + id),
 * pour alimenter les listes déroulantes (ex : conditions d'automatisation).
 *
 * ⚠️ IMPERSONATION : produits de la boutique de l'utilisateur EFFECTIF.
 */
export async function GET() {
  const scoped = await getScopedClient()
  if (!scoped) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { supabase, userId } = scoped

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('shopify_products')
    .select('id, title')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .limit(500)

  return NextResponse.json({ data: data || [] })
}
