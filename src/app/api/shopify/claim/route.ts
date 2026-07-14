import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyLinkToken } from '@/lib/shopify/link-token'
import { autoConfigureAgentFromShop } from '@/lib/shopify/sync'

/**
 * POST /api/shopify/claim  { token }
 *
 * Le marchand, connecté au compte de SON choix sur app.xeyo.io, réclame la boutique
 * désignée par le jeton de liaison qu'il a rapporté de l'admin Shopify.
 *
 * C'est le point exact où le cercle vicieux se brise : ce n'est plus Shopify qui
 * désigne le compte (via `shop_email`, qui n'est que l'email DE LA BOUTIQUE), c'est
 * l'utilisateur authentifié qui prend la boutique. Il peut donc utiliser son Gmail
 * perso, son compte Google, ou le compte qui gère déjà ses autres boutiques.
 *
 * ⚠️ SÉCURITÉ.
 *
 * Le jeton est signé (HMAC, `SHOPIFY_API_SECRET`) et n'est délivré que dans l'admin
 * Shopify de CETTE boutique — le porteur en est donc déjà administrateur. Il ne peut
 * pas être forgé, et il expire en 15 min.
 *
 * Une boutique DÉJÀ liée à un autre compte n'est jamais volée : on renvoie 409. Pour
 * la transférer, le propriétaire actuel doit d'abord la délier.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { token } = (await req.json().catch(() => ({}))) as { token?: string }

  // Un jeton invalide/expiré ne dit pas POURQUOI : ne pas aider un attaquant à
  // distinguer « mal signé » de « expiré ».
  const shop = verifyLinkToken(token)
  if (!shop) {
    return NextResponse.json(
      { error: 'Lien de liaison invalide ou expiré. Rouvrez Xeyo depuis votre admin Shopify.' },
      { status: 403 }
    )
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, user_id, shop_name')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error: 'Boutique introuvable ou désinstallée' }, { status: 404 })
  }

  // Déjà à moi : idempotent (double-clic, retour arrière).
  if (store.user_id === user.id) {
    return NextResponse.json({ data: { linked: true, shopName: store.shop_name } })
  }

  // Prise par quelqu'un d'autre : on ne vole pas une boutique, même avec un jeton valide.
  if (store.user_id) {
    return NextResponse.json(
      {
        error:
          'Cette boutique est déjà reliée à un autre compte Xeyo. Déliez-la d’abord ' +
          'depuis l’app Shopify (bouton « Délier ma boutique »).',
      },
      { status: 409 }
    )
  }

  // `.is('user_id', null)` : garde anti-course (deux onglets, deux comptes).
  const { error: linkErr } = await admin
    .from('shopify_stores')
    .update({
      user_id: user.id,
      billing_source: 'shopify',
      unlinked_at: null, // la liaison est explicite → la déliaison passée est annulée
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)
    .is('user_id', null)

  if (linkErr) {
    console.error('[shopify/claim] liaison échouée:', linkErr.message)
    return NextResponse.json({ error: 'Liaison impossible' }, { status: 500 })
  }

  // Best-effort : ne doit jamais bloquer la liaison elle-même.
  try {
    await autoConfigureAgentFromShop(store.id)
  } catch (e) {
    console.error('[shopify/claim] auto-config agent échec (non bloquant):', e)
  }

  return NextResponse.json({ data: { linked: true, shopName: store.shop_name } })
}
