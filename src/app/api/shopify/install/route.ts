import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { buildAuthUrl, isValidShopDomain, getShopifyConfig } from '@/lib/shopify/client'

/**
 * GET /api/shopify/install?shop=xxx.myshopify.com
 * Point d'entrée de l'installation : redirige le marchand vers l'écran
 * d'autorisation OAuth de Shopify. Le `state` (anti-CSRF) est posé en cookie.
 */
export async function GET(req: NextRequest) {
  const { apiKey, apiSecret } = getShopifyConfig()
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Config Shopify manquante (SHOPIFY_API_KEY/SECRET)' }, { status: 500 })
  }

  const shop = req.nextUrl.searchParams.get('shop')
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Paramètre shop invalide' }, { status: 400 })
  }

  // State anti-CSRF (vérifié au callback)
  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = buildAuthUrl(shop, state)

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 min
    path: '/',
  })
  return res
}
