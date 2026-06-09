import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'

/**
 * Webhook RGPD obligatoire — customers/redact
 * Un client (acheteur) demande la suppression de ses données personnelles.
 *
 * Xeyo ne stocke pas de profils acheteurs Shopify. Par sécurité, si un contact
 * WhatsApp correspond (par téléphone/email fournis), on purge ses données.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody || '{}') as {
    shop_domain?: string
    customer?: { email?: string; phone?: string }
  }
  console.log('[Shopify GDPR] customers/redact reçu pour shop:', payload?.shop_domain)

  const phone = payload.customer?.phone?.replace(/\D/g, '')
  const email = payload.customer?.email
  if (phone || email) {
    const supabase = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // Supprimer les contacts correspondants (cascade conversations/messages)
    if (phone) {
      await supabase.from('contacts').delete().eq('phone_number', phone)
    }
    if (email) {
      await supabase.from('contacts').delete().eq('email', email)
    }
  }

  return NextResponse.json({ received: true })
}
