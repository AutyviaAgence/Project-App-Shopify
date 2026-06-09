import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/shopify/client'

/**
 * Webhook RGPD obligatoire — customers/data_request
 * Un client (acheteur) demande à consulter les données détenues par l'app.
 *
 * Xeyo ne stocke pas de données acheteur Shopify de façon autonome (on lit
 * le catalogue/pages/politiques pour la KB, pas les profils acheteurs). On
 * accuse réception et on journalise la demande. Si des données acheteur
 * étaient stockées, on les fournirait au marchand pour transmission.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody || '{}')
  console.log('[Shopify GDPR] customers/data_request reçu pour shop:', payload?.shop_domain)

  // Aucune donnée acheteur Shopify stockée de façon persistante côté Xeyo.
  // Accusé de réception (200) requis par Shopify.
  return NextResponse.json({ received: true })
}
