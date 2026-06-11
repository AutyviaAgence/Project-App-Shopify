import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

// L'extension checkout (extensions.shopifycdn.com) appelle en cross-origin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const J = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS })

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

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
  // Pas de signature : autorisé (appel depuis une Checkout UI Extension, qui
  // ne passe pas par le proxy signé). L'opt-in n'est pas une action sensible
  // et la boutique est validée ensuite (doit exister + WhatsApp connecté).
  if (!signature) return true
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => { if (key !== 'signature') params[key] = value })
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('')
  const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex')
  return computed === signature
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (!verifyProxySignature(searchParams)) {
    return J({ ok: false, error: 'invalid signature' }, 401)
  }

  const shop = searchParams.get('shop')
  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/[^0-9]/g, '')
  const name = (body.name as string)?.trim() || null
  // L'opt-in page Merci couvre aussi le marketing (case "commande + offres")
  const marketing = body.marketing === true

  if (!shop) return J({ ok: false, error: 'shop manquant' }, 400)
  if (!phone || phone.length < 8) return J({ ok: false, error: 'Numéro invalide' }, 400)

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
  if (!store?.user_id) return J({ ok: false, error: 'boutique non liée' }, 404)

  // Session WhatsApp connectée (pour rattacher le contact)
  const { data: session } = await admin
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', store.user_id)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!session) return J({ ok: false, error: 'WhatsApp non connecté' }, 400)

  // Upsert contact opted-in
  const now = new Date().toISOString()
  const { data: contact, error } = await admin
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
        marketing_consent: marketing,
        marketing_consent_at: marketing ? now : null,
      },
      { onConflict: 'session_id,phone_number' }
    )
    .select('id')
    .single()
  if (error) return J({ ok: false, error: error.message }, 500)

  // Message de remerciement (premier contact WhatsApp).
  // Utilise le template confirmation_commande (déjà approuvé).
  // On envoie de façon synchrone pour pouvoir signaler à la vitrine si le
  // numéro n'a pas de compte WhatsApp (→ 422 no_whatsapp, message d'erreur ciblé).
  if (contact?.id) {
    try {
      const { sendNotification } = await import('@/lib/notifications/send')
      const result = await sendNotification({
        contactId: contact.id,
        kind: 'order_confirmed',
        vars: { '1': name || 'cher client', '2': 'votre commande' },
        emailSubject: 'Merci pour votre commande !',
        emailBody: `Bonjour ${name || ''},\n\nMerci pour votre commande ! Nous sommes ravis de vous compter parmi nos clients.`,
      })

      // Numéro sans compte WhatsApp : on annule l'opt-in et on demande
      // au client de corriger son numéro.
      if (result.error === 'no_whatsapp') {
        await admin.from('contacts')
          .update({ opt_in_status: 'pending', preferred_channel: 'none' })
          .eq('id', contact.id)
        return J({ ok: false, error: 'no_whatsapp' }, 422)
      }

      if (result.error) {
        // Échec d'envoi (template non approuvé, token, etc.) : le contact reste
        // opt-in, mais on le journalise pour diagnostic.
        console.error('[optin] notif non envoyée:', result.error)
      }
    } catch (e) {
      console.error('[optin] message de remerciement échec (non bloquant):', e)
    }
  }

  return J({ ok: true })
}
