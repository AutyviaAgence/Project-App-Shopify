import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { shopifyGraphQL } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * Debug TEMPORAIRE — renvoie le résultat brut de la requête shopPolicies pour
 * diagnostiquer pourquoi les politiques ne sont pas synchronisées.
 *   GET /api/debug/shop-policies  (Authorization: Bearer CRON_SECRET)
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: store } = await admin
    .from('shopify_stores')
    .select('shop_domain, access_token, scopes')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!store?.access_token) return NextResponse.json({ error: 'pas de boutique' }, { status: 404 })

  const token = decryptMessage(store.access_token)

  // On essaie plusieurs variantes pour voir laquelle remonte les politiques.
  const q1 = await shopifyGraphQL<{ shop: { shopPolicies: { type: string; title: string; body: string; url: string }[] } }>(
    store.shop_domain, token,
    `{ shop { shopPolicies { type title body url } } }`
  )

  return NextResponse.json({
    shop: store.shop_domain,
    scopes: store.scopes,
    q1_ok: q1.ok,
    q1_error: q1.ok ? null : q1.error,
    q1_policies: q1.ok ? (q1.data.shop.shopPolicies || []).map((p) => ({ type: p.type, title: p.title, bodyLen: (p.body || '').length, url: p.url })) : null,
  })
}
