import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'

/**
 * Webhook Shopify — products/create, products/update, products/delete.
 * Rafraîchit le document RAG « catalogue » de la boutique (scope catalog).
 *
 * Debounce : les éditions en masse déclenchent de nombreux webhooks ; on ne
 * resynchronise au plus qu'une fois toutes les CATALOG_RESYNC_DEBOUNCE_MIN.
 * Le hash anti-doublon évite en plus de re-générer les embeddings si le
 * catalogue n'a pas réellement changé.
 */
const CATALOG_RESYNC_DEBOUNCE_MIN = 5

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
    .select('id, user_id, catalog_synced_at')
    .eq('shop_domain', shopDomain)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.user_id) return NextResponse.json({ received: true })

  // Debounce : sauter si on a déjà resynchronisé le catalogue récemment.
  const last = store.catalog_synced_at ? new Date(store.catalog_synced_at).getTime() : 0
  if (Date.now() - last < CATALOG_RESYNC_DEBOUNCE_MIN * 60_000) {
    return NextResponse.json({ received: true, skipped: 'debounced' })
  }
  // Réclamer la fenêtre immédiatement (évite la course entre webhooks rapprochés).
  await admin.from('shopify_stores').update({ catalog_synced_at: new Date().toISOString() }).eq('id', store.id)

  try {
    const { syncShopToKnowledge } = await import('@/lib/shopify/sync')
    const r = await syncShopToKnowledge(store.id, { scope: 'catalog' })
    return NextResponse.json({ received: true, resynced: r.ok, processed: r.ok ? r.processed : 0 })
  } catch (e) {
    console.error('[webhook products] resync échec:', e)
    return NextResponse.json({ received: true, error: 'resync failed' })
  }
}
