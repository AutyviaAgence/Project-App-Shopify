import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * App Proxy — enregistrement d'un opt-in WhatsApp depuis la vitrine.
 *
 * Appelé depuis la page produit/panier du marchand via le proxy Shopify :
 *   POST https://{boutique}.myshopify.com/apps/xeyo/optin
 *   body: { phone, name? }
 *
 * Crée/met à jour un contact opted-in (preferred_channel = whatsapp) côté Xeyo,
 * pour que les notifications transactionnelles puissent lui être envoyées.
 */
function verifyProxySignature(searchParams: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return true // pas de secret configuré → on n'impose pas (dev)
  const signature = searchParams.get('signature') || ''
  if (!signature) return false
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => { if (key !== 'signature') params[key] = value })
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('')
  const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex')
  return computed === signature
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (!verifyProxySignature(searchParams)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  const shop = searchParams.get('shop')
  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/[^0-9]/g, '')
  const name = (body.name as string)?.trim() || null

  if (!shop) return NextResponse.json({ ok: false, error: 'shop manquant' }, { status: 400 })
  if (!phone || phone.length < 8) return NextResponse.json({ ok: false, error: 'Numéro invalide' }, { status: 400 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Boutique → user
  const { data: store } = await admin
    .from('shopify_stores')
    .select('user_id')
    .eq('shop_domain', shop)
    .maybeSingle()
  if (!store?.user_id) return NextResponse.json({ ok: false, error: 'boutique non liée' }, { status: 404 })

  // Session WhatsApp connectée (pour rattacher le contact)
  const { data: session } = await admin
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', store.user_id)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!session) return NextResponse.json({ ok: false, error: 'WhatsApp non connecté' }, { status: 400 })

  // Upsert contact opted-in
  const now = new Date().toISOString()
  const { error } = await admin
    .from('contacts')
    .upsert(
      {
        session_id: session.id,
        phone_number: phone,
        name,
        opt_in_status: 'subscribed',
        opt_in_source: 'shopify_storefront',
        opt_in_at: now,
        preferred_channel: 'whatsapp',
        channel_optin_at: now,
      },
      { onConflict: 'session_id,phone_number' }
    )
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
