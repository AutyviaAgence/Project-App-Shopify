import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { logDataAccess } from '@/lib/audit/log'

/**
 * Webhook RGPD obligatoire — customers/redact
 * Un client (acheteur) demande la suppression de ses données personnelles.
 *
 * ⚠️ ISOLATION MULTI-TENANT : la suppression est STRICTEMENT limitée aux contacts
 * DU MARCHAND qui a reçu la demande (shop_domain → user_id → ses sessions
 * WhatsApp → ses contacts). Une suppression par téléphone/email seul effacerait
 * les contacts de TOUS les marchands ayant ce même numéro — destruction de
 * données cross-tenant.
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
  const shopDomain = payload.shop_domain
  console.log('[Shopify GDPR] customers/redact reçu pour shop:', shopDomain)

  const phone = payload.customer?.phone?.replace(/\D/g, '')
  const email = payload.customer?.email?.trim().toLowerCase()

  // Sans boutique identifiable, on ne supprime RIEN (on ne peut pas garantir
  // l'isolation) — on accuse quand même réception (Shopify exige un 200).
  if (!shopDomain || (!phone && !email)) {
    return NextResponse.json({ received: true })
  }

  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Boutique → marchand propriétaire.
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('user_id')
    .eq('shop_domain', shopDomain)
    .maybeSingle()
  if (!store?.user_id) {
    return NextResponse.json({ received: true })
  }

  // Sessions WhatsApp DE CE MARCHAND : le périmètre de suppression autorisé.
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', store.user_id)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) {
    return NextResponse.json({ received: true })
  }

  // Suppression scopée : uniquement les contacts appartenant aux sessions de ce
  // marchand (cascade conversations/messages via les FK).
  // `.select('id')` sur un delete renvoie les lignes supprimées : c'est ainsi
  // qu'on sait COMBIEN de personnes ont été effacées — le chiffre qu'exige un
  // journal d'audit (et qu'on ne pouvait pas donner jusqu'ici).
  let deleted = 0

  if (phone) {
    const { data } = await supabase
      .from('contacts')
      .delete()
      .in('session_id', sessionIds)
      .eq('phone_number', phone)
      .select('id')
    deleted += data?.length ?? 0
  }
  if (email) {
    // `email` ou `notify_email` peuvent porter l'adresse de l'acheteur.
    const { data } = await supabase
      .from('contacts')
      .delete()
      .in('session_id', sessionIds)
      .or(`email.ilike.${email},notify_email.ilike.${email}`)
      .select('id')
    deleted += data?.length ?? 0
  }

  // Journal d'audit RGPD. Non-awaité : on ne retarde pas l'accusé de réception
  // à Shopify (qui exige une réponse rapide) pour écrire une ligne de log.
  // Aucune donnée personnelle dans `metadata` — ni le téléphone ni l'email, qu'on
  // vient précisément d'effacer.
  void logDataAccess({
    action: 'erasure',
    resource: 'contacts',
    recordCount: deleted,
    actorRole: 'system',
    targetUserId: store.user_id,
    metadata: { source: 'shopify:customers/redact', shopDomain, by: phone ? 'phone' : 'email' },
    req,
  })

  return NextResponse.json({ received: true })
}
