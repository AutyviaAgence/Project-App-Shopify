import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyAppProxySignature } from '@/lib/shopify/proxy-auth'

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

  // ⚠️ FAIL-CLOSED. La vérification était CONDITIONNELLE (`if (signature)`) : une
  // requête SANS signature traversait le contrôle sans rien vérifier. Un simple
  //     GET /api/shopify/proxy/widget?shop=nimportequi.myshopify.com
  // suffisait donc à récupérer le NUMÉRO WHATSAPP de n'importe quel marchand
  // installé — énumérable en boucle. Fuite de donnée personnelle.
  //
  // La bulle passe TOUJOURS par l'App Proxy (/apps/xeyo/widget), et Shopify signe
  // systématiquement ces requêtes : exiger la signature ne casse rien.
  if (!verifyAppProxySignature(searchParams)) {
    return NextResponse.json({ enabled: false, error: 'invalid signature' }, { status: 401 })
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
