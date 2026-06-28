import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/shopify/collections
 * Liste les collections synchronisées de la boutique de l'utilisateur
 * (titre + id), pour alimenter la liste déroulante « Collection contient ».
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('shopify_collections')
    .select('id, title')
    .eq('user_id', user.id)
    .order('position', { ascending: true })
    .limit(500)

  return NextResponse.json({ data: data || [] })
}
