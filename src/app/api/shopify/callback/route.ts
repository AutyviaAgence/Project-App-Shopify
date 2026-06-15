import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import {
  isValidShopDomain,
  verifyHmac,
  exchangeCodeForToken,
  fetchShopInfo,
  getShopifyConfig,
  registerWebhooks,
} from '@/lib/shopify/client'
import { encryptMessage } from '@/lib/crypto/encryption'

/**
 * GET /api/shopify/callback
 * Callback OAuth Shopify : Shopify renvoie ici après autorisation du marchand.
 * Vérifie HMAC + state, échange le code contre un access_token, récupère les
 * infos boutique, stocke le tout (token chiffré) dans shopify_stores.
 */
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const { shop, code, hmac, state } = params

  // 1. Validations de base
  if (!shop || !isValidShopDomain(shop) || !code) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  // 2. Vérifier le HMAC (authenticité de la requête Shopify)
  if (!hmac || !verifyHmac(params, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  // 3. Vérifier le state anti-CSRF (cookie posé à l'install)
  const cookieState = req.cookies.get('shopify_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    return NextResponse.json({ error: 'State invalide (CSRF)' }, { status: 401 })
  }

  // 4. Échanger le code contre un access_token permanent
  const tokenResult = await exchangeCodeForToken(shop, code)
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.error }, { status: 502 })
  }

  // 5. Récupérer les infos de base de la boutique
  const shopInfo = await fetchShopInfo(shop, tokenResult.accessToken)
  const info = shopInfo.ok ? shopInfo.data.shop : null

  // 6. Stocker (token chiffré) via service_role (le marchand n'est pas encore loggé côté app)
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase
    .from('shopify_stores')
    .upsert(
      {
        shop_domain: shop,
        access_token: encryptMessage(tokenResult.accessToken),
        scopes: tokenResult.scope,
        shop_name: info?.name ?? null,
        shop_email: info?.email ?? null,
        currency: info?.currencyCode ?? null,
        country: info?.billingAddress?.country ?? null,
        is_active: true,
        installed_at: new Date().toISOString(),
        uninstalled_at: null,
      },
      { onConflict: 'shop_domain' }
    )

  // 6.5. S'abonner aux webhooks métier (orders/fulfilled…) — best effort
  const wh = await registerWebhooks(shop, tokenResult.accessToken)
  if (!wh.ok) console.error('[Shopify] Abonnement webhooks partiel:', wh.errors)

  // 7. Rediriger vers /shopify avec autolink : si l'utilisateur est déjà connecté
  // à Xeyo (parcours depuis la landing), la boutique se lie automatiquement à son
  // compte ; sinon il est invité à créer un compte / se connecter, puis revient ici.
  const { appUrl } = getShopifyConfig()
  const res = NextResponse.redirect(`${appUrl}/shopify?shop=${encodeURIComponent(shop)}&autolink=1`)
  res.cookies.delete('shopify_oauth_state')
  return res
}
