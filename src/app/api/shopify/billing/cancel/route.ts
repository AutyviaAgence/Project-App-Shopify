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
  // ⚠️ `.order().limit(1)` INDISPENSABLE — le reste du code l'applique déjà.
  //
  // Un compte peut avoir DEUX lignes actives (réinstallation où l'ancienne n'a
  // pas été désactivée). `maybeSingle()` renvoie alors une erreur PostgREST →
  // `store` null → 404 « Boutique introuvable » : le marchand ne peut PLUS
  // résilier depuis l'app et continue d'être facturé. C'est aussi un motif de
  // rejet App Store (§1.2.3).
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, shop_domain, access_token, shopify_charge_id, current_period_end')
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!store?.access_token) {
    return NextResponse.json({ error: 'Boutique Shopify introuvable' }, { status: 404 })
  }
  if (!store.shopify_charge_id) {
    // Déjà sans abonnement payant : rien à annuler, on s'assure juste de l'état.
    // ⚠️ `subscription_status` est NOT NULL : écrire `null` faisait ÉCHOUER tout
    // l'UPDATE (violates not-null constraint) → l'état n'était jamais corrigé.
    // `'none'` est la valeur prévue pour « aucun abonnement » (cf. app-uninstalled).
    await admin
      .from('shopify_stores')
      .update({ plan: 'free', subscription_status: 'none', updated_at: new Date().toISOString() })
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
  // ⚠️ ANNULER **TOUS** LES ABONNEMENTS, PAS SEULEMENT CELUI QU'ON SUIT.
  //
  // Un changement de plan différé laisse DEUX abonnements actifs chez Shopify :
  // l'ancien (qui court jusqu'à l'échéance) et le nouveau (qui prendra le relais).
  //
  // On n'annulait que `shopify_charge_id` — et ce champ pointe sur le NOUVEAU. Donc
  // un marchand en Scale, ayant programmé un passage à Pro, puis annulant, voyait le
  // Pro supprimé… et le Scale continuer de le facturer 349 €/mois. L'inverse exact de
  // ce qu'il demandait.
  //
  // Le seul remède fiable : demander à Shopify la liste réelle de ses abonnements
  // actifs, et tous les annuler. Après ça, plus rien ne facture.
  const { listActiveSubscriptions } = await import('@/lib/shopify/client')
  const active = await listActiveSubscriptions(store.shop_domain, token)

  // ⚠️ RELEVER LA FIN DE PÉRIODE **AVANT** D'ANNULER.
  //
  // Shopify met `currentPeriodEnd` à `null` une fois l'abonnement annulé : la
  // date jusqu'à laquelle le marchand a payé serait perdue. Or c'est elle qui
  // lui garantit l'accès jusqu'à l'échéance (`getUserPlan` la lit, et retombe
  // en gratuit si elle est absente — le privant de ce qu'il a réglé).
  const ends = active.map((s) => s.currentPeriodEnd).filter(Boolean) as string[]
  const paidUntil = ends.length > 0 ? ends.sort().reverse()[0] : store.current_period_end

  // Filet : si l'appel échoue, on annule au moins celui qu'on connaît.
  const toCancel = active.length > 0
    ? active.map((s) => s.id)
    : [store.shopify_charge_id]

  const failures: string[] = []
  for (const id of toCancel) {
    const res = await cancelAppSubscription(store.shop_domain, token, id)
    if (!res.ok) {
      failures.push(res.error)
      continue
    }
    const errs = res.data?.appSubscriptionCancel?.userErrors ?? []
    if (errs.length > 0) failures.push(errs[0]?.message || 'Annulation refusée')
  }

  // ⚠️ Ne PAS marquer la boutique comme annulée si un abonnement subsiste : le
  // marchand croirait ne plus payer alors que Shopify le facture toujours.
  if (failures.length > 0 && failures.length === toCancel.length) {
    return NextResponse.json({ error: failures[0] }, { status: 502 })
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
      // Sans cette date, `getUserPlan` retombe en gratuit sur-le-champ et le
      // marchand perd la période qu'il a payée.
      ...(paidUntil ? { current_period_end: paidUntil } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  return NextResponse.json({ data: { cancelled: true } })
}
