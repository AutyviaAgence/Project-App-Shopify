import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/shopify/resync
 * Resynchronise la base de connaissances (catalogue + pages + politiques) de la
 * boutique active de l'utilisateur. Déclenché par le bouton « Resynchroniser ».
 * Le hash anti-doublon évite de re-générer les embeddings si rien n'a changé.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'Aucune boutique connectée' }, { status: 404 })

  const { syncShopToKnowledge } = await import('@/lib/shopify/sync')
  const r = await syncShopToKnowledge(store.id, { scope: 'all' })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ data: r })
}
