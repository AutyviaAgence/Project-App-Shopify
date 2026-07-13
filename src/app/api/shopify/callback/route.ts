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

  // 3. Anti-rejeu : le HMAC (étape 2) prouve déjà que la requête vient de
  //    Shopify avec NOTRE secret ; on exige en plus un timestamp frais.
  //    Le cookie state n'est PAS exigé : les installs initiées côté Shopify
  //    (App Store / installation managée) n'ont jamais traversé /install,
  //    et un double-clic sur « Connecter » écrase le cookie du 1er essai.
  const ts = parseInt(params.timestamp || '0', 10)
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 600) {
    return NextResponse.json({ error: 'Requête expirée (timestamp)' }, { status: 401 })
  }
  const cookieState = req.cookies.get('shopify_oauth_state')?.value
  if (cookieState && state && cookieState !== state) {
    // Trace sans bloquer : state d'un essai précédent (double-clic) ou multi-onglets.
    console.warn('[shopify callback] state cookie ≠ param (toléré, HMAC+timestamp valides)', { shop })
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

  const { data: storeRow } = await supabase
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
        // Installation via l'App Store ⇒ facturation Shopify OBLIGATOIRE
        // (Billing API). Jamais Stripe : ce serait un motif de rejet/suspension.
        billing_source: 'shopify',
      },
      { onConflict: 'shop_domain' }
    )
    .select('id, user_id')
    .single()

  // 6.5. S'abonner aux webhooks métier (orders/fulfilled…) — best effort
  const wh = await registerWebhooks(shop, tokenResult.accessToken)
  if (!wh.ok) console.error('[Shopify] Abonnement webhooks partiel:', wh.errors)

  const { appUrl } = getShopifyConfig()

  // 7. LIEN DIRECT : la requête de callback porte les cookies de session Xeyo
  // (navigation top-level sur le même domaine). Si l'utilisateur est connecté,
  // on lie la boutique ICI — sans rebond fragile par /shopify — et on le
  // renvoie dans l'onboarding (ou le dashboard si onboarding déjà terminé).
  // INSCRIPTION AUTOMATIQUE VIA SHOPIFY : installer l'app VAUT inscription. On ne
  // dépend plus du cookie Supabase (absent dans l'iframe et pour tout nouveau
  // marchand) : resolveXeyoUser crée le compte à partir de l'email de la boutique,
  // ou rattache un compte Xeyo existant portant le même email. Le marchand ne
  // saisit jamais d'identifiants.
  try {
    const { resolveXeyoUser } = await import('@/lib/shopify/resolve-user')
    const resolved = await resolveXeyoUser(shop)
    if (resolved) {
      // Si un utilisateur est déjà connecté sur ce navigateur ET que c'est un AUTRE
      // compte que celui de la boutique, on ne l'écrase pas : la boutique reste liée
      // à son compte (resolveXeyoUser ne relie que si user_id était NULL).
      const res = NextResponse.redirect(`${appUrl}/shopify?shop=${encodeURIComponent(shop)}`)
      res.cookies.delete('shopify_oauth_state')
      return res
    }
  } catch (e) {
    console.error('[Shopify callback] provisioning du compte échoué:', e)
  }

  // Fallback : boutique introuvable / pas d'email exploitable → page embedded, qui
  // affichera l'erreur (plus de parcours « autolink » hors admin).
  const res = NextResponse.redirect(`${appUrl}/shopify?shop=${encodeURIComponent(shop)}`)
  res.cookies.delete('shopify_oauth_state')
  return res
}
