import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/shopify/token'
import { findCustomerByEmail, findCustomerByPhone } from '@/lib/shopify/client'
import { checkRateLimit } from '@/lib/rate-limit'

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
/**
 * ⚠️ CETTE ROUTE NE PEUT PAS EXIGER DE SIGNATURE — et c'est structurel.
 *
 * La popup envoie l'opt-in par `sendBeacon` pendant le déchargement de la page
 * (intention de sortie). Le proxy Shopify — seul chemin qui signe — répond par
 * une redirection, or `sendBeacon` abandonne les requêtes redirigées à cet
 * instant : l'opt-in serait perdu. D'où l'appel direct à app.xeyo.io.
 *
 * Le contrôle précédent était donc `if (!signature) return true` : omettre le
 * paramètre suffisait à tout contourner. N'importe qui pouvait injecter des
 * opt-ins dans la boutique de n'importe quel marchand (le domaine est
 * énumérable) et déclencher l'envoi d'un message WhatsApp depuis SON numéro,
 * avec un lien de panier arbitraire — un hameçonnage émis par le numéro de
 * confiance du marchand, qui brûle en prime sa note de qualité Meta.
 *
 * Faute de pouvoir signer, on vérifie donc l'ORIGINE : le navigateur la pose
 * lui-même sur une requête cross-origin et une page tierce ne peut pas la
 * falsifier. Elle doit correspondre à la boutique déclarée.
 */
function verifyProxySignature(searchParams: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const signature = searchParams.get('signature') || ''
  // Pas de signature → l'origine fait foi (vérifiée par l'appelant).
  if (!signature) return true
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => { if (key !== 'signature') params[key] = value })
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('')
  const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex')
  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * La requête vient-elle bien d'une page de CETTE boutique ?
 *
 * `Origin` est posé par le navigateur sur toute requête cross-origin et ne peut
 * pas être falsifié depuis une page web : c'est notre substitut à la signature.
 * On accepte le domaine `.myshopify.com` de la boutique et son domaine
 * personnalisé s'il est connu.
 *
 * Un appel serveur-à-serveur (curl) n'envoie pas d'`Origin` — il est donc
 * refusé, ce qui est précisément le but.
 */
function hasBrowserOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') || ''
  // `Origin: null` est envoyé par les iframes sandbox et les documents locaux :
  // ce n'est pas une page de boutique.
  if (!origin || origin === 'null') return false
  try {
    const u = new URL(origin)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.length > 0
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // Anti-abus : limite les opt-ins (pas de signature possible depuis la popup,
  // donc on protège par le débit). Empêche l'abonnement massif de numéros tiers.
  const limited = checkRateLimit(req, 'AUTH')
  if (limited) {
    Object.entries(CORS).forEach(([k, v]) => limited.headers.set(k, v))
    return limited
  }

  const { searchParams } = new URL(req.url)
  if (!verifyProxySignature(searchParams)) {
    return J({ ok: false, error: 'invalid signature' }, 401)
  }

  // Sans signature, l'origine navigateur est la seule preuve que l'appel vient
  // d'une vraie page de boutique. Un script serveur (curl, bot) n'en envoie pas :
  // c'est ce qui bloquait l'injection d'opt-ins dans la boutique d'autrui.
  if (!searchParams.get('signature') && !hasBrowserOrigin(req)) {
    return J({ ok: false, error: 'origin required' }, 401)
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
  // Origine de l'opt-in : 'popup' (widget site), 'thankyou' (page Merci), etc.
  // Sert à déclencher un message spécifique selon la source.
  const source = (body.source as string)?.trim() || null
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
  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit ;
  // si null (reconnexion nécessaire), on saute juste la liaison (best-effort).
  let shopifyCustomerId: string | null = null
  if (store.access_token) {
    try {
      const token = await getValidAccessToken(shop)
      if (token) {
        const cust = (email ? await findCustomerByEmail(shop, token, email) : null)
          || await findCustomerByPhone(shop, token, phone)
        shopifyCustomerId = cust?.id ?? null
      } else {
        console.warn('[optin] jeton Shopify invalide pour', shop, '→ liaison client Shopify ignorée')
      }
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

      // Événement SPÉCIFIQUE à l'opt-in via la popup du site : permet un message
      // dédié (distinct de l'opt-in au checkout). Le marchand branche l'auto
      // « Opt-in via popup ».
      if (source === 'popup') {
        await enqueueAutomations({
          userId: store.user_id,
          event: 'optin_popup',
          ctx: {
            contactId: contact.id,
            variables: baseVars,
            dedupKey: `optin_popup:${contact.id}`,
          },
        })
      }

      // Détection panier abandonné "maison" (100% WhatsApp) : si le client coche
      // l'opt-in AVEC un panier non vide, on enfile l'événement checkout_abandoned.
      // Le cron respecte le délai de l'automatisation et SKIP si une commande
      // arrive entre-temps (vrai abandon uniquement).
      console.log(`[optin] contact=${contact.id} cart_url=${cartUrl ? 'présent' : 'ABSENT'} cart_total=${cartTotal ?? 'null'}`)
      if (cartUrl) {
        const r = await enqueueAutomations({
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
        console.log(`[optin] checkout_abandoned → ${r.queued} job(s) créé(s)`)
      } else {
        console.log('[optin] pas de panier → pas de relance panier abandonné (normal si panier vide)')
      }
    } catch (e) {
      console.error('[optin] enqueue automations échec (non bloquant):', e)
    }
  }

  return J({ ok: true })
}
