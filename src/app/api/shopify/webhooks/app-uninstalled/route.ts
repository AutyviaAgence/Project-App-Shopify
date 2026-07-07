import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'

/**
 * Webhook Shopify — app/uninstalled.
 * Quand le marchand désinstalle l'app, le token est révoqué côté Shopify :
 * on marque la boutique INACTIVE (le dashboard/onboarding la voient
 * déconnectée) et on purge le token devenu inutilisable. On garde la ligne
 * (historique + réinstallation propre via onConflict shop_domain).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  if (!shopDomain) return NextResponse.json({ received: true })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin
    .from('shopify_stores')
    .update({ is_active: false, access_token: '', subscription_status: null })
    .eq('shop_domain', shopDomain)

  if (error) console.error('[webhook app-uninstalled] update échec:', error.message)
  else console.log('[webhook app-uninstalled] boutique désactivée:', shopDomain)

  return NextResponse.json({ received: true })
}
