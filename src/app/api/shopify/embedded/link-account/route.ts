import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { sessionFromRequest } from '@/lib/shopify/session-token'
import { ensureStoreProvisioned } from '@/lib/shopify/ensure-store'
import { fetchStaffUser } from '@/lib/shopify/client'
import { createLinkToken } from '@/lib/shopify/link-token'
import { autoConfigureAgentFromShop } from '@/lib/shopify/sync'

/**
 * LIAISON BOUTIQUE ↔ COMPTE XEYO, DEPUIS L'ADMIN SHOPIFY.
 *
 *   GET  → état de la liaison + QUI est devant l'écran (identité Shopify vérifiée).
 *   POST → exécute le choix du marchand : `create` (nouveau compte) ou `link` (le sien).
 *
 * ── LE CERCLE VICIEUX QUE CETTE ROUTE CASSE ───────────────────────────────────
 *
 * L'app IMPOSAIT le compte portant `shop_email` (l'email du propriétaire de la
 * boutique). Un marchand inscrit avec un autre email ne pouvait donc JAMAIS relier
 * sa boutique à son vrai compte : « Utiliser un autre compte » le ramenait
 * indéfiniment au même. Et s'il s'inscrivait via Google, on créait un second compte
 * en douce — son compte Google restait orphelin, coincé sur l'onboarding à vie.
 *
 * ── LES DEUX PORTES (exigence Shopify « Built for Shopify » 3.1.3) ────────────
 *
 * Shopify demande explicitement les deux, et pas l'une sans l'autre :
 *   · une inscription SANS FRICTION (« Users should be able to start using the app
 *     immediately after installing it ») ;
 *   · et, pour un SaaS qui existe hors de Shopify, la possibilité de « connect their
 *     store to their existing credentials ».
 *
 * D'où :
 *   · `create` — Shopify a vérifié l'email de la personne connectée
 *     (`associated_user.email_verified`). On provisionne son compte. Zéro friction.
 *   · `link`   — le marchand a déjà un compte (Gmail perso, Google, autre boutique).
 *     On lui remet un JETON DE LIAISON signé ; il va sur app.xeyo.io, s'y connecte au
 *     compte de SON choix, et c'est CE compte qui réclame la boutique.
 *
 * L'app ne décide plus jamais à sa place. Elle demande.
 *
 * ── SÉCURITÉ ──────────────────────────────────────────────────────────────────
 *
 * On n'agit que sur la boutique portée par le session token (HMAC vérifié) : on ne
 * peut donc pas toucher à la boutique d'autrui.
 *
 * `create` n'accepte QUE `email_verified === true` — c'est la règle Shopify
 * (« If you're using emails as an identification source, then make sure that the
 * `email_verified` field is also `true` »). Sans elle, un staff pourrait se donner
 * l'email d'un tiers et récupérer son compte Xeyo.
 *
 * Les COLLABORATEURS (agence, freelance : `collaborator === true`) sont exclus de
 * `create` : ils ne sont pas le marchand, et la boutique ne doit pas atterrir sur le
 * compte personnel d'un prestataire de passage. Ils peuvent utiliser `link`, qui
 * demande une authentification explicite.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Le session token brut, à échanger contre l'identité du staff. */
function rawToken(req: NextRequest): string {
  return (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
}

/**
 * État de la liaison, et identité de la personne connectée à l'admin.
 * Ne lie RIEN : c'est une lecture. Le marchand choisit ensuite.
 */
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const token = rawToken(req)
  await ensureStoreProvisioned(session.shop, token)

  const { data: store } = await admin()
    .from('shopify_stores')
    .select('user_id, shop_name')
    .eq('shop_domain', session.shop)
    .eq('is_active', true)
    .maybeSingle()

  // Déjà liée : inutile d'aller chercher l'identité (un appel réseau de moins).
  if (store?.user_id) {
    return NextResponse.json({
      data: { installed: true, linked: true, shopName: store.shop_name ?? null },
    })
  }

  // Pas encore liée : QUI est devant l'écran ? C'est ce qui permet de lui proposer
  // « Continuer en tant que jean@gmail.com » plutôt que de lui imposer un compte.
  const staff = await fetchStaffUser(session.shop, token)

  // A-t-il déjà un compte Xeyo sous cet email ? → « c'est bien moi » au lieu de « créer ».
  let hasAccount = false
  if (staff?.email && staff.emailVerified) {
    const { data: existing } = await admin()
      .from('profiles')
      .select('id')
      .ilike('email', staff.email)
      .maybeSingle()
    hasAccount = !!existing
  }

  // `create` n'est proposé que si Shopify garantit l'identité, et que ce n'est pas
  // un prestataire externe.
  const canCreate = !!staff?.email && staff.emailVerified && !staff.collaborator

  return NextResponse.json({
    data: {
      installed: !!store,
      linked: false,
      shopName: store?.shop_name ?? null,
      shopDomain: session.shop,
      staffEmail: staff?.email ?? null,
      staffName: [staff?.firstName, staff?.lastName].filter(Boolean).join(' ') || null,
      canCreate,
      hasAccount,
      isCollaborator: staff?.collaborator === true,
    },
  })
}

/**
 * Exécute le choix du marchand.
 *
 *   { action: 'create' } → provisionne/rattache le compte de l'identité Shopify vérifiée.
 *   { action: 'link' }   → renvoie l'URL app.xeyo.io où il choisira SON compte.
 */
export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { action } = (await req.json().catch(() => ({}))) as { action?: string }
  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, user_id, shop_name, shop_domain')
    .eq('shop_domain', session.shop)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  if (store.user_id) return NextResponse.json({ data: { linked: true } })

  // ── PORTE 2 : « J'ai déjà un compte Xeyo » ─────────────────────────────────
  // On ne devine pas lequel : on l'envoie le choisir. Le jeton prouve simplement
  // qu'il parle bien pour CETTE boutique (il est dans son admin).
  if (action === 'link') {
    const token = createLinkToken(session.shop)
    if (!token) {
      return NextResponse.json({ error: 'Liaison indisponible (config serveur)' }, { status: 500 })
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'
    return NextResponse.json({ data: { linkUrl: `${appUrl}/link?token=${token}` } })
  }

  // ── PORTE 1 : « Créer mon compte » (sans friction) ─────────────────────────
  if (action !== 'create') {
    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  }

  const staff = await fetchStaffUser(session.shop, rawToken(req))

  // ⚠️ Identité NON vérifiée par Shopify → on ne provisionne rien. Le marchand doit
  // passer par `link` et prouver qui il est en s'authentifiant lui-même.
  if (!staff?.email || !staff.emailVerified) {
    return NextResponse.json(
      { error: 'Shopify n’a pas pu vérifier votre email. Reliez un compte Xeyo existant.' },
      { status: 403 }
    )
  }
  if (staff.collaborator) {
    return NextResponse.json(
      {
        error:
          'Vous êtes collaborateur sur cette boutique. Demandez au propriétaire de ' +
          'créer le compte, ou reliez votre propre compte Xeyo.',
      },
      { status: 403 }
    )
  }

  // Un compte porte-t-il déjà cet email ? On le RATTACHE (jamais de doublon).
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', staff.email)
    .maybeSingle()

  let userId = existing?.id as string | undefined

  if (!userId) {
    const { data: made, error } = await supabase.auth.admin.createUser({
      email: staff.email,
      email_confirm: true, // Shopify a vérifié cet email (email_verified === true).
      user_metadata: {
        full_name: [staff.firstName, staff.lastName].filter(Boolean).join(' ') || store.shop_name,
        signup_source: 'shopify',
        shop_domain: store.shop_domain,
      },
    })
    if (error || !made?.user?.id) {
      console.error('[shopify/link-account] création du compte échouée:', error?.message)
      return NextResponse.json({ error: 'Création du compte impossible' }, { status: 500 })
    }
    userId = made.user.id
  }

  // `.is('user_id', null)` : garde anti-course — deux onglets ne peuvent pas lier
  // la boutique à deux comptes différents.
  const { error: linkErr } = await supabase
    .from('shopify_stores')
    .update({
      user_id: userId,
      billing_source: 'shopify',
      unlinked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)
    .is('user_id', null)

  if (linkErr) {
    console.error('[shopify/link-account] liaison échouée:', linkErr.message)
    return NextResponse.json({ error: 'Liaison impossible' }, { status: 500 })
  }

  // Best-effort : ne doit jamais bloquer l'entrée dans l'app.
  try {
    await autoConfigureAgentFromShop(store.id)
  } catch (e) {
    console.error('[shopify/link-account] auto-config agent échec (non bloquant):', e)
  }

  return NextResponse.json({ data: { linked: true } })
}
