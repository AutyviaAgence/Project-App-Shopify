import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/shopify/token'
import { shopifyGraphQL } from '@/lib/shopify/client'

/**
 * GET /api/shopify/debug-webhooks — TEMPORAIRE, à supprimer.
 *
 * Liste les webhooks réellement enregistrés chez Shopify pour la boutique.
 *
 * Contexte : l'inscription des webhooks échouait en 403 (jetons non-expirants
 * refusés). Aucun webhook n'était donc enregistré — y compris `app/uninstalled`,
 * d'où une boutique qui restait « connectée » après désinstallation.
 * Cette route vérifie ce que Shopify a VRAIMENT, au lieu de le supposer.
 *
 * Réservé aux admins.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { data: store } = await admin
    .from('shopify_stores')
    .select('shop_domain')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'Aucune boutique active' }, { status: 404 })

  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    return NextResponse.json({ error: 'Jeton Shopify indisponible', shop: store.shop_domain }, { status: 502 })
  }

  const res = await shopifyGraphQL<{
    webhookSubscriptions: { nodes: { topic: string; endpoint: { callbackUrl?: string } }[] }
  }>(
    store.shop_domain,
    token,
    `{ webhookSubscriptions(first: 50) {
         nodes { topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } }
       } }`
  )

  if (!res.ok) return NextResponse.json({ shop: store.shop_domain, erreur: res.error }, { status: 502 })

  const nodes = res.data.webhookSubscriptions.nodes
  return NextResponse.json({
    shop: store.shop_domain,
    nombre: nodes.length,
    webhooks: nodes.map((n) => ({ topic: n.topic, url: n.endpoint?.callbackUrl })),
  })
}
