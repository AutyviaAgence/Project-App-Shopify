import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/shopify/store-status
 * Statut de connexion Shopify pour l'utilisateur connecté (carte Dashboard).
 * Lit la boutique active de l'utilisateur et renvoie le résumé de synchro.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_name, shop_domain, last_synced_at, last_sync_summary, store_context')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) return NextResponse.json({ data: { connected: false } })

  const summary = (store.last_sync_summary || {}) as { products?: number; pages?: boolean; policies?: boolean }
  // store_context : { name, currency, country, links: { label, url }[] }
  const ctx = (store.store_context || {}) as {
    name?: string
    currency?: string | null
    country?: string | null
    links?: { label: string; url: string }[]
  }
  return NextResponse.json({
    data: {
      connected: true,
      shop_name: store.shop_name,
      shop_domain: store.shop_domain,
      last_synced_at: store.last_synced_at,
      products_synced: typeof summary.products === 'number' ? summary.products : null,
      has_pages: !!summary.pages,
      has_policies: !!summary.policies,
      context: {
        name: ctx.name || store.shop_name,
        currency: ctx.currency || null,
        country: ctx.country || null,
        links: Array.isArray(ctx.links) ? ctx.links : [],
      },
    },
  })
}
