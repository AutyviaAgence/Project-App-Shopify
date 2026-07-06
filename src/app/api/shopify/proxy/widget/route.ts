import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * App Proxy — config publique du widget WhatsApp pour une boutique.
 *
 * Appelé depuis la vitrine du marchand via le proxy Shopify :
 *   https://{boutique}.myshopify.com/apps/xeyo/widget?shop=...&signature=...
 * Shopify signe la requête ; on vérifie la signature avec SHOPIFY_API_SECRET.
 *
 * Retourne { enabled, phone, message } :
 *  - enabled = true seulement si une session WhatsApp est connectée
 *  - phone = numéro du WhatsApp connecté
 *  - message = message d'accueil du lien de la boutique
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const shop = searchParams.get('shop')

  // Vérification de la signature App Proxy (Shopify) — comparaison timing-safe.
  const secret = process.env.SHOPIFY_API_SECRET
  if (secret) {
    const signature = searchParams.get('signature') || ''
    if (signature) {
      const params: Record<string, string> = {}
      searchParams.forEach((value, key) => { if (key !== 'signature') params[key] = value })
      const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('')
      const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex')
      const a = Buffer.from(computed, 'utf8')
      const b = Buffer.from(signature, 'utf8')
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return NextResponse.json({ enabled: false, error: 'invalid signature' }, { status: 401 })
      }
    }
  }

  if (!shop) {
    return NextResponse.json({ enabled: false })
  }

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
  if (!store?.user_id) {
    return NextResponse.json({ enabled: false })
  }

  // Session WhatsApp connectée ?
  const { data: session } = await admin
    .from('whatsapp_sessions')
    .select('id, phone_number')
    .eq('user_id', store.user_id)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!session?.phone_number) {
    return NextResponse.json({ enabled: false })
  }

  // Message d'accueil du lien de la boutique (s'il existe et est actif)
  const { data: link } = await admin
    .from('wa_links')
    .select('slug, pre_filled_message, is_active')
    .eq('user_id', store.user_id)
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const enabled = link ? link.is_active !== false : true

  // URL de redirection Xeyo (tracking + gestion du format WhatsApp côté serveur)
  const appBase = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'
  const url = link?.slug ? `${appBase}/api/wa/${link.slug}` : null

  return NextResponse.json(
    {
      enabled,
      url, // ← la bulle pointe vers ce lien Xeyo (pas wa.me directement)
      phone: session.phone_number,
      message: link?.pre_filled_message || 'Bonjour, j\'ai une question sur ma commande.',
    },
    {
      headers: {
        // Cache court côté CDN Shopify
        'Cache-Control': 'public, max-age=60',
        'Content-Type': 'application/json',
      },
    }
  )
}
