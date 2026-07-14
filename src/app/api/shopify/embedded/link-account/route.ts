import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { sessionFromRequest } from '@/lib/shopify/session-token'
import { ensureStoreProvisioned } from '@/lib/shopify/ensure-store'

/**
 * GET  /api/shopify/embedded/link-account — état de la liaison boutique ↔ compte.
 * POST /api/shopify/embedded/link-account — (re)lie la boutique à un compte Xeyo.
 *
 * ⚠️ POURQUOI CETTE ROUTE EXISTE.
 *
 * Une boutique DÉLIÉE (`user_id = NULL`) n'a plus de compte Xeyo. `resolveXeyoUser`
 * renvoie donc `null`, `getAuthedUser` aussi, et TOUTES les routes embedded
 * répondent 401 : l'app affichait une page blanche, le marchand était bloqué sans
 * aucun moyen de s'en sortir depuis l'admin Shopify.
 *
 * Cette route ne dépend PAS d'un compte : elle n'exige que le session token. Elle
 * permet donc de sortir de l'impasse — soit en recréant un compte depuis l'email de
 * la boutique, soit en reliant un compte Xeyo existant par son email.
 *
 * ⚠️ SÉCURITÉ : on n'agit que sur la boutique portée par le session token (HMAC
 * vérifié). Relier un compte EXISTANT exige que son email corresponde à celui de la
 * boutique (`shop_email`) — sinon n'importe quel staff Shopify pourrait rattacher la
 * boutique au compte Xeyo d'un tiers, et lui donner accès à ses contacts.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** État : la boutique est-elle installée ? reliée à un compte ? */
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // La boutique peut ne pas exister encore (1re ouverture) : on la provisionne.
  const rawToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  await ensureStoreProvisioned(session.shop, rawToken)

  const { data: store } = await admin()
    .from('shopify_stores')
    .select('user_id, shop_email, shop_name')
    .eq('shop_domain', session.shop)
    .eq('is_active', true)
    .maybeSingle()

  return NextResponse.json({
    data: {
      installed: !!store,
      linked: !!store?.user_id,
      shopEmail: store?.shop_email ?? null,
      shopName: store?.shop_name ?? null,
    },
  })
}

/** Relie la boutique : à un compte existant (même email) ou à un compte créé à la volée. */
export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, user_id, shop_email, shop_name, shop_domain')
    .eq('shop_domain', session.shop)
    .eq('is_active', true)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'Boutique non installée' }, { status: 404 })
  if (store.user_id) return NextResponse.json({ data: { linked: true } }) // déjà reliée

  const email = (store.shop_email || '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json(
      { error: 'Email de la boutique indisponible — reliez-la depuis app.xeyo.io' },
      { status: 400 }
    )
  }

  // Compte existant portant l'email DE LA BOUTIQUE ? On le rattache (pas de doublon).
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  let userId = existing?.id as string | undefined

  if (!userId) {
    const { data: made, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true, // l'email vient de Shopify → considéré vérifié
      user_metadata: {
        full_name: store.shop_name || store.shop_domain,
        signup_source: 'shopify',
        shop_domain: store.shop_domain,
      },
    })
    if (error || !made?.user?.id) {
      console.error('[link-account] création du compte échouée :', error?.message)
      return NextResponse.json({ error: 'Création du compte impossible' }, { status: 500 })
    }
    userId = made.user.id
  }

  const { error: linkErr } = await supabase
    .from('shopify_stores')
    .update({
      user_id: userId,
      billing_source: 'shopify',
      // La boutique redevient adoptable : on lève le marqueur de déliaison volontaire.
      unlinked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)
    .is('user_id', null) // pas de course : on ne vole pas une boutique reliée entre-temps

  if (linkErr) {
    console.error('[link-account] liaison échouée :', linkErr.message)
    return NextResponse.json({ error: 'Liaison impossible' }, { status: 500 })
  }

  console.log('[link-account] boutique reliée :', session.shop, '→', userId)
  return NextResponse.json({ data: { linked: true } })
}
