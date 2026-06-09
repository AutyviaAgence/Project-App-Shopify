import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'

/**
 * Webhook RGPD obligatoire — shop/redact
 * Envoyé ~48h après la désinstallation de l'app par une boutique.
 * On doit supprimer les données de la boutique détenues par l'app.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody || '{}') as { shop_domain?: string }
  const shop = payload.shop_domain
  console.log('[Shopify GDPR] shop/redact reçu pour shop:', shop)

  if (shop) {
    const supabase = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // Supprimer l'enregistrement de la boutique (token, infos).
    // Les agents/KB créés appartiennent au compte Xeyo de l'utilisateur et
    // restent gérés via la suppression de compte ; on retire ici le lien Shopify.
    await supabase.from('shopify_stores').delete().eq('shop_domain', shop)
  }

  return NextResponse.json({ received: true })
}
