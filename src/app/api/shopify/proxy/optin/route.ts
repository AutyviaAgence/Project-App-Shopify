import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'
import { findCustomerByEmail, findCustomerByPhone } from '@/lib/shopify/client'

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
  const email = (body.email as string)?.trim().toLowerCase() || null
  // Infos panier (envoyées par la popup quand le panier n'est pas vide) → permet
  // une relance "panier abandonné" 100% WhatsApp, sans dépendre du webhook Shopify
  // ni de l'email : on a le numéro + le panier dès l'opt-in.
  const cartUrl = (body.cart_url as string)?.trim() || null
  const cartTotal = typeof body.cart_total === 'number' ? body.cart_total : null
  // L'opt-in page Merci couvre aussi le marketing (case "commande + offres")
  const marketing = body.marketing === true

  if (!shop) return J({ ok: false, error: 'shop manquant' }, 400)
  if (!phone || phone.length < 8) return J({ ok: false, error: 'Numéro invalide' }, 400)

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Boutique → user (+ token pour relier le client Shopify)
  const { data: store } = await admin
    .from('shopify_stores')
    .select('user_id, access_token')
    .eq('shop_domain', shop)
    .maybeSingle()
  if (!store?.user_id) return J({ ok: false, error: 'boutique non liée' }, 404)

  // Session WhatsApp connectée AVEC des credentials WABA valides (on ignore les
  // sessions "connected" fantômes sans token/numéro, qui feraient échouer l'envoi).
  const { data: session } = await admin
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', store.user_id)
    .eq('status', 'connected')
    .not('waba_phone_number_id', 'is', null)
    .not('waba_access_token', 'is', null)
    .limit(1)
    .maybeSingle()
  if (!session) return J({ ok: false, error: 'WhatsApp non connecté' }, 400)

  // Cas 3 (opt-in) : relier le contact à son client Shopify si possible, par
  // email d'abord (le plus fiable), sinon par téléphone. Best-effort, non bloquant.
  let shopifyCustomerId: string | null = null
  if (store.access_token) {
    try {
      const token = decryptMessage(store.access_token)
      const cust = (email ? await findCustomerByEmail(shop, token, email) : null)
        || await findCustomerByPhone(shop, token, phone)
      shopifyCustomerId = cust?.id ?? null
    } catch { /* non bloquant */ }
  }

  // Upsert contact opted-in
  const now = new Date().toISOString()
  const { data: contact, error } = await admin
    .from('contacts')
    .upsert(
      {
        session_id: session.id,
        phone_number: phone,
        name,
        notify_email: email,
        opt_in_status: 'subscribed',
        opt_in_source: 'shopify_storefront',
        opt_in_at: now,
        preferred_channel: 'whatsapp',
        channel_optin_at: now,
        marketing_consent: marketing,
        marketing_consent_at: marketing ? now : null,
        ...(shopifyCustomerId ? { shopify_customer_id: shopifyCustomerId } : {}),
      },
      { onConflict: 'session_id,phone_number' }
    )
    .select('id')
    .single()
  if (error) return J({ ok: false, error: error.message }, 500)

  // ENVOI = AUTOMATISATIONS. On n'envoie plus rien EN DUR ici. À la place, on
  // émet l'événement "contact_opted_in" : le marchand branche son propre message
  // de bienvenue via une automatisation (déclencheur « Opt-in reçu »).
  if (contact?.id) {
    try {
      const { enqueueAutomations } = await import('@/lib/automations/engine')
      const firstName = (name || '').split(' ')[0] || ''
      const baseVars = {
        customer_first_name: firstName,
        customer_full_name: name || '',
        customer_phone: phone,
        store_name: shop?.replace('.myshopify.com', '') || 'la boutique',
      }
      await enqueueAutomations({
        userId: store.user_id,
        event: 'contact_opted_in',
        ctx: {
          contactId: contact.id,
          variables: baseVars,
          dedupKey: contact.id, // un seul message de bienvenue par contact
        },
      })

      // Détection panier abandonné "maison" (100% WhatsApp) : si le client coche
      // l'opt-in AVEC un panier non vide, on enfile l'événement checkout_abandoned.
      // Le cron respecte le délai de l'automatisation et SKIP si une commande
      // arrive entre-temps (vrai abandon uniquement).
      if (cartUrl) {
        await enqueueAutomations({
          userId: store.user_id,
          event: 'checkout_abandoned',
          ctx: {
            contactId: contact.id,
            total: cartTotal ?? undefined,
            variables: {
              ...baseVars,
              cart_url: cartUrl,
              order_total: cartTotal != null ? String(cartTotal) : '',
              order_status: 'Panier en attente',
            },
            // Anti-doublon par contact + tranche de 5 min : un même client ne
            // reçoit pas plusieurs relances rapprochées, mais peut être relancé
            // s'il re-remplit un panier un peu plus tard (et permet de retester).
            dedupKey: `cart:${contact.id}:${Math.floor(Date.now() / (5 * 60_000))}`,
          },
        })
      }
    } catch (e) {
      console.error('[optin] enqueue automations échec (non bloquant):', e)
    }
  }

  return J({ ok: true })
}
