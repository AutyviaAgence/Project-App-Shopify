import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { logDataAccess } from '@/lib/audit/log'

/**
 * Webhook RGPD obligatoire — customers/data_request
 * Un acheteur demande à consulter les données que l'app détient sur lui.
 *
 * Xeyo DÉTIENT bien des données acheteur : un contact WhatsApp (téléphone, email,
 * nom, opt-in) et l'historique de conversation. On rassemble donc ce qui concerne
 * cet acheteur — STRICTEMENT dans le périmètre du marchand demandeur (isolation
 * multi-tenant, cf. customers/redact) — et on le journalise pour que le marchand
 * puisse le transmettre. Le contenu des messages n'est PAS exporté ici (chiffré
 * au repos) : on fournit les métadonnées et le volume.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody || '{}') as {
    shop_domain?: string
    customer?: { id?: number; email?: string; phone?: string }
  }
  const shopDomain = payload.shop_domain
  const phone = payload.customer?.phone?.replace(/\D/g, '')
  const email = payload.customer?.email?.trim().toLowerCase()
  console.log('[Shopify GDPR] customers/data_request reçu pour shop:', shopDomain)

  if (!shopDomain || (!phone && !email)) {
    return NextResponse.json({ received: true })
  }

  try {
    const supabase = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Boutique → marchand → SES sessions (périmètre autorisé).
    const { data: store } = await supabase
      .from('shopify_stores').select('user_id').eq('shop_domain', shopDomain).maybeSingle()
    if (!store?.user_id) return NextResponse.json({ received: true })

    const { data: sessions } = await supabase
      .from('whatsapp_sessions').select('id').eq('user_id', store.user_id)
    const sessionIds = (sessions || []).map((s) => s.id)
    if (sessionIds.length === 0) return NextResponse.json({ received: true })

    // Contact(s) de CE marchand correspondant à l'acheteur.
    let q = supabase
      .from('contacts')
      .select('id, phone_number, name, email, notify_email, opt_in_status, opt_in_at, created_at')
      .in('session_id', sessionIds)
    q = phone
      ? q.eq('phone_number', phone)
      : q.or(`email.ilike.${email},notify_email.ilike.${email}`)
    const { data: contacts } = await q

    // Volume de conversation (métadonnées : le contenu est chiffré au repos).
    const contactIds = (contacts || []).map((c) => c.id)
    let messageCount = 0
    if (contactIds.length > 0) {
      const { data: convs } = await supabase
        .from('conversations').select('id').in('contact_id', contactIds)
      const convIds = (convs || []).map((c) => c.id)
      if (convIds.length > 0) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
        messageCount = count ?? 0
      }
    }

    // ⚠️ Ne PAS écrire les contacts en console : les logs Docker conserveraient
    // téléphones et emails en clair, indéfiniment et hors de tout contrôle RGPD —
    // exactement ce que cette demande d'accès est censée protéger.
    // On journalise le fait qu'un accès a eu lieu, et son volume. Le détail reste
    // en base, accessible au marchand qui doit le transmettre à l'acheteur.
    void logDataAccess({
      action: 'export',
      resource: 'contacts',
      recordCount: contacts?.length ?? 0,
      actorRole: 'system',
      targetUserId: store?.user_id ?? null,
      metadata: {
        source: 'shopify:customers/data_request',
        shopDomain,
        messagesCount: messageCount,
      },
      req,
    })
  } catch (e) {
    // Ne jamais échouer : Shopify exige un 200 (sinon retry en boucle).
    console.error('[Shopify GDPR] data_request échec de collecte:', e)
  }

  // Accusé de réception (200) requis par Shopify.
  return NextResponse.json({ received: true })
}
