import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { cancelAppSubscription } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { getAuthedUser } from '@/lib/shopify/embedded-auth'

/**
 * POST /api/shopify/billing/cancel
 * Annule l'abonnement Shopify du marchand (retour au plan gratuit).
 *
 * App Store requirement 1.2.3 : « Permettre les changements de plan sans contacter
 * le support ». Sans cette route, un marchand facturé par Shopify ne pouvait NI
 * annuler NI descendre de plan → motif de rejet.
 *
 * Auth : session token (admin Shopify, embedded) OU cookie (dashboard web).
 */
export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req)
  if (!authed) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Boutique du marchand (filtre explicite sur user_id : en embedded il n'y a pas
  // de RLS, c'est le code qui garantit l'isolation).
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, shop_domain, access_token, shopify_charge_id')
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.access_token) {
    return NextResponse.json({ error: 'Boutique Shopify introuvable' }, { status: 404 })
  }
  if (!store.shopify_charge_id) {
    // Déjà sans abonnement payant : rien à annuler, on s'assure juste de l'état.
    await admin
      .from('shopify_stores')
      .update({ plan: 'free', subscription_status: null, updated_at: new Date().toISOString() })
      .eq('id', store.id)
    return NextResponse.json({ data: { cancelled: true, already: true } })
  }

  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux — l'annulation échouerait sans que
  // le marchand le sache (il continuerait d'être facturé). Erreur explicite si null.
  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    return NextResponse.json(
      { error: 'Jeton Shopify invalide — rouvrez l\'application depuis l\'admin Shopify pour la reconnecter, puis réessayez.' },
      { status: 502 }
    )
  }
  const res = await cancelAppSubscription(store.shop_domain, token, store.shopify_charge_id)
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 502 })
  }
  const errs = res.data?.appSubscriptionCancel?.userErrors ?? []
  if (errs.length > 0) {
    return NextResponse.json({ error: errs[0]?.message || 'Annulation refusée par Shopify' }, { status: 502 })
  }

  // ⚠️ L'ACCÈS RESTE OUVERT JUSQU'À LA FIN DE LA PÉRIODE PAYÉE.
  //
  // On basculait le marchand en `plan: 'free'` SUR-LE-CHAMP. Il perdait donc
  // instantanément l'accès qu'il venait de régler — il avait payé un mois complet et
  // se retrouvait bridé le jour même. Shopify ne rembourse pas au prorata : c'était
  // une double peine.
  //
  // On garde donc son plan et on le marque `canceled` : le renouvellement est bien
  // coupé chez Shopify, mais il profite de ce qu'il a payé jusqu'au bout.
  // `pending_plan: 'free'` mémorise la bascule, que le webhook d'abonnement appliquera
  // le jour de l'échéance.
  //
  // ⚠️ `getUserPlan` doit donc accepter le statut `canceled` comme un accès valide
  // tant que `current_period_end` n'est pas dépassé — sinon ce correctif ne sert à
  // rien.
  await admin
    .from('shopify_stores')
    .update({
      subscription_status: 'canceled',
      pending_plan: 'free',
      shopify_charge_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  return NextResponse.json({ data: { cancelled: true } })
}
