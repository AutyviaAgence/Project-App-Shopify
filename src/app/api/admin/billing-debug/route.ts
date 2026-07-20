import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/shopify/token'
import { isValidShopDomain } from '@/lib/shopify/client'

/**
 * GET /api/admin/billing-debug?shop=xxx.myshopify.com
 *
 * DIAGNOSTIC : ce que Shopify considère comme actif, vs ce que dit notre base.
 *
 * Les jetons sont CHIFFRÉS en base (format `iv:tag:payload`) : les lire
 * directement en SQL donne une valeur inutilisable. Cette route passe par
 * `getValidAccessToken()`, qui déchiffre ET rafraîchit — c'est le seul moyen
 * fiable d'interroger Shopify depuis l'extérieur.
 *
 * Lecture seule, réservée aux admins. Ne modifie jamais rien.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const shop = req.nextUrl.searchParams.get('shop')
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Paramètre shop invalide' }, { status: 400 })
  }

  const { data: store } = await admin
    .from('shopify_stores')
    .select('plan, pending_plan, subscription_status, billing_interval, current_period_end, shopify_charge_id, updated_at')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()

  const token = await getValidAccessToken(shop)
  if (!token) {
    return NextResponse.json({ db: store, shopify: null, error: 'Jeton Shopify invalide' })
  }

  // Toutes les souscriptions, pas seulement les ACTIVE : c'est justement la
  // coexistence (ancienne + différée) qu'on cherche à observer.
  const res = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{
        currentAppInstallation {
          activeSubscriptions { id name status createdAt currentPeriodEnd test
            lineItems { plan { pricingDetails { ... on AppRecurringPricing { interval price { amount currencyCode } } } } } }
        }
      }`,
    }),
  })

  const json = await res.json()

  return NextResponse.json({
    db: store,
    shopify: json?.data?.currentAppInstallation?.activeSubscriptions ?? null,
    shopifyErrors: json?.errors ?? null,
  })
}
