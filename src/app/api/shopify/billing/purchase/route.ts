import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, getShopifyConfig, createAppPurchaseOneTime } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { ONE_TIME_PACKS, isTestBilling, type PackId } from '@/lib/shopify/billing'

/**
 * POST /api/shopify/billing/purchase  { pack: 'tokens' | 'ai_credits' }
 *
 * ⚠️ CE QUE CETTE ROUTE RÉPARE.
 *
 * L'achat de tokens et de crédits IA ne passait que par Stripe — et ces routes
 * REFUSENT les marchands Shopify (403, conformité App Store §1.2.1 : facturer un
 * marchand Shopify hors Billing API est un motif de rejet).
 *
 * Or l'onboarding IMPOSE une boutique Shopify. Donc le bouton « Acheter des
 * tokens » renvoyait une erreur à 100 % des marchands. Ils voyaient une offre
 * qu'ils ne pouvaient pas acheter.
 *
 * ── SÉCURITÉ ────────────────────────────────────────────────────────────────
 *
 * Le client n'envoie QUE l'identifiant du pack. Le prix et la quantité sont
 * décidés ici (`ONE_TIME_PACKS`) : accepter un prix venu du client permettrait
 * d'acheter 500 000 tokens pour 0 €.
 *
 * Et surtout : le pack N'EST PAS mis dans l'URL de retour. `appPurchaseOneTimeCreate`
 * n'ayant aucun champ de métadonnées, on mémorise l'achat en base et on ne fait
 * voyager qu'un identifiant interne opaque. Un `?pack=tokens` dans l'URL serait
 * manipulable — il suffirait de le rejouer pour se créditer indéfiniment.
 */
export async function POST(req: NextRequest) {
  const { getAuthedUser } = await import('@/lib/shopify/embedded-auth')
  const authed = await getAuthedUser(req)
  if (!authed) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { shop?: string; pack?: string }
  const packId = body.pack as PackId | undefined

  if (!packId || !(packId in ONE_TIME_PACKS)) {
    return NextResponse.json({ error: 'Pack invalide' }, { status: 400 })
  }

  const pack = ONE_TIME_PACKS[packId]

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ⚠️ RÉSOLUTION DE LA BOUTIQUE, SANS DÉPENDRE DE L'APPELANT.
  //
  // `authed.shop` n'existe QU'EN EMBEDDED (il vient du session token Shopify).
  // Depuis le dashboard web il est vide, et les appelants qui n'envoyaient pas
  // `shop` dans le corps se prenaient « Paramètre shop invalide » — c'était le cas
  // des 3 boutons de recharge (page Abonnement, Réglages, jauge d'usage), dont un
  // échouait même en silence. On déduit donc la boutique du marchand authentifié
  // quand elle n'est pas fournie : plus aucun appelant ne peut l'oublier.
  let shop = authed.shop || body.shop
  if (!shop) {
    const { data: own } = await admin
      .from('shopify_stores')
      .select('shop_domain')
      .eq('user_id', authed.userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    shop = own?.shop_domain ?? undefined
  }

  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: 'Aucune boutique Shopify liée à votre compte.' },
      { status: 400 }
    )
  }

  // La boutique doit appartenir à l'utilisateur : en embedded il n'y a pas de
  // RLS, c'est ce filtre qui garantit l'isolation entre marchands.
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id')
    .eq('shop_domain', shop)
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  }

  // Les jetons Shopify expirent : lire `access_token` en base donnerait tôt ou
  // tard un 403 silencieux.
  const token = await getValidAccessToken(shop)
  if (!token) {
    return NextResponse.json(
      { error: 'Jeton Shopify invalide — rouvrez l’application depuis l’admin Shopify, puis réessayez.' },
      { status: 502 }
    )
  }

  // On enregistre l'achat AVANT de créer la charge : c'est cette ligne qui porte
  // « ce marchand achète CE pack », puisque Shopify ne peut pas le mémoriser.
  const { data: purchase, error: insertErr } = await admin
    .from('shopify_one_time_purchases')
    .insert({
      user_id: authed.userId,
      shop_domain: shop,
      pack: packId,
      status: 'pending',
      price_cents: pack.priceCents,
    })
    .select('id')
    .single()

  if (insertErr || !purchase) {
    console.error('[billing/purchase] enregistrement échoué:', insertErr?.message, insertErr?.code)
    // ⚠️ Message EXPLICITE : « Achat impossible » ne disait rien et masquait la
    // vraie cause. La plus fréquente est la table absente (migration
    // 20260715_one_time_purchases.sql non appliquée) → PostgREST renvoie PGRST205
    // / 42P01. On le dit clairement au lieu de laisser chercher.
    const missingTable = insertErr?.code === 'PGRST205' || insertErr?.code === '42P01'
    return NextResponse.json({
      error: missingTable
        ? "Le système d'achat n'est pas encore initialisé côté base (table shopify_one_time_purchases manquante). Appliquez la migration 20260715_one_time_purchases.sql."
        : `Achat impossible : ${insertErr?.message || 'erreur inconnue'}`,
    }, { status: 500 })
  }

  const { appUrl } = getShopifyConfig()
  // Seul l'identifiant interne voyage. Le pack, le prix et la quantité se
  // relisent en base — rien de manipulable.
  const returnUrl = `${appUrl}/api/shopify/billing/purchase/callback?shop=${encodeURIComponent(shop)}&id=${purchase.id}`

  const res = await createAppPurchaseOneTime(shop, token, {
    name: pack.label,
    price: pack.priceCents / 100,
    currencyCode: 'EUR',
    returnUrl,
    test: isTestBilling(),
  })

  if (!res.ok) {
    await admin.from('shopify_one_time_purchases').update({ status: 'declined' }).eq('id', purchase.id)
    return NextResponse.json({ error: res.error }, { status: 502 })
  }

  const payload = res.data.appPurchaseOneTimeCreate
  if (payload.userErrors?.length || !payload.confirmationUrl) {
    await admin.from('shopify_one_time_purchases').update({ status: 'declined' }).eq('id', purchase.id)
    return NextResponse.json(
      { error: payload.userErrors?.[0]?.message || 'Achat refusé par Shopify' },
      { status: 502 }
    )
  }

  // On mémorise l'identifiant de la charge pour pouvoir la vérifier au retour.
  if (payload.appPurchaseOneTime?.id) {
    await admin
      .from('shopify_one_time_purchases')
      .update({ charge_id: payload.appPurchaseOneTime.id })
      .eq('id', purchase.id)
  }

  return NextResponse.json({ data: { confirmationUrl: payload.confirmationUrl } })
}
