import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptMessage } from '@/lib/crypto/encryption'
import { listAllOrders } from '@/lib/shopify/client'
import { persistShopifyOrder } from '@/lib/shopify/persist-order'
import type { ShopifyOrder } from '@/lib/automations/shopify-context'

/**
 * POST /api/shopify/backfill-orders
 *
 * Rejoue l'historique des commandes Shopify dans `shopify_orders` : Shopify
 * n'envoie pas de webhook pour les commandes créées AVANT l'abonnement, donc le
 * tableau des contacts (nb commandes + CA) reste vide pour l'existant. Cette
 * route récupère toutes les commandes via l'Admin API et les persiste (liées aux
 * contacts par téléphone/email), comme le ferait le webhook orders/create.
 *
 * Idempotent : persistShopifyOrder fait un upsert (onConflict store+order_id),
 * donc relancer ne crée pas de doublons.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.shop_domain || !store.access_token) {
    return NextResponse.json({ error: 'Aucune boutique Shopify connectée.' }, { status: 400 })
  }

  const token = decryptMessage(store.access_token)
  const result = await listAllOrders(store.shop_domain, token)
  if (!result.ok) {
    return NextResponse.json({ error: `Récupération Shopify échouée : ${result.error}` }, { status: 502 })
  }

  let saved = 0
  for (const order of result.orders) {
    try {
      await persistShopifyOrder(user.id, store.shop_domain, order as unknown as ShopifyOrder)
      saved += 1
    } catch {
      // best-effort : on continue même si une commande échoue
    }
  }

  // Combien ont pu être reliées à un contact (pour info au marchand).
  // shopify_orders n'est pas dans les types générés → cast (cf. api/shopify/sales).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: linked } = await (supabase as any)
    .from('shopify_orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('contact_id', 'is', null)

  return NextResponse.json({
    fetched: result.orders.length,
    saved,
    linkedToContact: linked || 0,
  })
}
