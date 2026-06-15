import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'

/**
 * Webhook Shopify — shop/update.
 * Shopify n'a PAS de webhook dédié aux pages/politiques ; shop/update se
 * déclenche pour de nombreux changements de la boutique. On resynchronise donc
 * tout le RAG (catalogue + pages + politiques), mais le hash anti-doublon fait
 * que la plupart des shop/update ne re-génèrent rien (coût zéro).
 *
 * Petit debounce pour absorber les rafales de shop/update.
 */
const SHOP_RESYNC_DEBOUNCE_MIN = 2

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, user_id, last_synced_at')
    .eq('shop_domain', shopDomain)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.user_id) return NextResponse.json({ received: true })

  const last = store.last_synced_at ? new Date(store.last_synced_at).getTime() : 0
  if (Date.now() - last < SHOP_RESYNC_DEBOUNCE_MIN * 60_000) {
    return NextResponse.json({ received: true, skipped: 'debounced' })
  }
  await admin.from('shopify_stores').update({ last_synced_at: new Date().toISOString() }).eq('id', store.id)

  try {
    const { syncShopToKnowledge } = await import('@/lib/shopify/sync')
    const r = await syncShopToKnowledge(store.id, { scope: 'all' })
    return NextResponse.json({ received: true, resynced: r.ok, processed: r.ok ? r.processed : 0 })
  } catch (e) {
    console.error('[webhook shop] resync échec:', e)
    return NextResponse.json({ received: true, error: 'resync failed' })
  }
}
