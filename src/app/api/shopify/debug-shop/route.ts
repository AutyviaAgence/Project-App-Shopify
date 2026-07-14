import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * GET /api/shopify/debug-shop — TEMPORAIRE, à supprimer.
 *
 * Interroge l'Admin API et renvoie la réponse BRUTE de `{ shop { … } }`, pour
 * comprendre pourquoi `shop.email` arrive vide alors que le champ est `String!`
 * (donc non-nullable) et n'exige aucun scope.
 *
 * Réservé aux admins : la réponse contient l'email du marchand.
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
    .select('shop_domain, access_token, scopes')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!store?.access_token) return NextResponse.json({ error: 'Aucune boutique' }, { status: 404 })

  let token: string
  try {
    token = decryptMessage(store.access_token)
  } catch (e) {
    return NextResponse.json({ error: 'Déchiffrement du token échoué', detail: String(e) }, { status: 500 })
  }

  const results: Record<string, unknown> = { shop: store.shop_domain, scopesEnBase: store.scopes }

  // On teste chaque champ séparément : si l'un fait tomber la requête, on saura lequel.
  const queries: Record<string, string> = {
    minimal: `{ shop { name } }`,
    email: `{ shop { name email } }`,
    contactEmail: `{ shop { name contactEmail } }`,
    complet: `{ shop { name email contactEmail currencyCode } }`,
    avecBillingAddress: `{ shop { name email currencyCode billingAddress { country } } }`,
  }

  for (const [label, query] of Object.entries(queries)) {
    try {
      const res = await fetch(`https://${store.shop_domain}/admin/api/2026-07/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query }),
      })
      results[label] = { status: res.status, body: await res.json() }
    } catch (e) {
      results[label] = { erreur: String(e) }
    }
  }

  return NextResponse.json(results)
}
