import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, listActiveSubscriptions } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { PLANS, type PlanId } from '@/lib/shopify/plans'

/** Déduit le plan depuis le nom d'un abonnement Shopify (« Xeyo <Plan> [(Annuel)] »),
 *  avec compat rename Growth→Pro, et renvoie son prix mensuel de référence.
 *  Sert à départager deux abonnements ACTIVE (on garde le plus cher). */
function planPriceFromName(name: string): number {
  const n = (name || '').toLowerCase()
  const plan: PlanId | undefined = n.includes('growth')
    ? 'pro'
    : (Object.keys(PLANS) as PlanId[]).find((id) => id !== 'free' && n.includes(PLANS[id].name.toLowerCase()))
  return plan ? PLANS[plan].priceEur : 0
}

/**
 * POST /api/shopify/billing/sync
 *
 * Demande à Shopify la vérité sur l'abonnement, et remet la base d'aplomb.
 *
 * ⚠️ POURQUOI CE FILET EST INDISPENSABLE.
 *
 * L'activation d'un plan repose sur le callback de facturation. Mais ce callback
 * peut ne JAMAIS être appelé : le marchand ferme l'onglet, le navigateur bloque la
 * redirection, le réseau coupe. Il a alors payé — Shopify le facture — mais Xeyo
 * l'ignore : `subscription_status` reste `pending`, et comme le contrôle de quota
 * exige `active`, il retombe en GRATUIT à chaque rafraîchissement.
 *
 * C'est exactement ce qui s'est produit : `plan: 'scale'`, `status: 'pending'` —
 * le marchand paie et n'a rien.
 *
 * Cette route interroge `activeSubscriptions` (la source de vérité) et réaligne la
 * base. Elle est appelée automatiquement au chargement de l'app embedded.
 */
export async function POST(req: NextRequest) {
  const { getAuthedUser } = await import('@/lib/shopify/embedded-auth')
  const authed = await getAuthedUser(req)
  if (!authed) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { shop?: string }
  const shop = authed.shop || body.shop
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Paramètre shop invalide' }, { status: 400 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, plan, pending_plan, subscription_status, shopify_charge_id, current_period_end')
    .eq('shop_domain', shop)
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  const token = await getValidAccessToken(shop)
  if (!token) return NextResponse.json({ error: 'Jeton Shopify invalide' }, { status: 502 })

  // La vérité, telle que Shopify la connaît.
  const active = await listActiveSubscriptions(shop, token)
  const actives = active.filter((s) => s.status === 'ACTIVE')
  // ⚠️ CHOIX DÉTERMINISTE quand deux abonnements ACTIVE coexistent (downgrade
  // différé : ancien + nouveau se chevauchent). `find` prenait le PREMIER, dont
  // l'ordre n'est pas garanti par Shopify — on pouvait tomber sur le nouveau
  // (moins cher) et appliquer la baisse trop tôt. On privilégie donc :
  //   1. l'abonnement qu'on suit déjà (shopify_charge_id) — c'est le référent ;
  //   2. sinon le plus cher (l'ancien, tant que la baisse n'a pas pris effet).
  //
  // ⚠️ VÉRIFIÉ SUR L'API : avec `APPLY_ON_NEXT_BILLING_CYCLE`, Shopify n'expose
  // qu'UN SEUL abonnement actif — l'ancien. Le nouveau n'est créé qu'au cycle
  // suivant, les deux NE coexistent PAS (contrairement à ce qu'on supposait ici).
  //
  // Le tri par prix reste comme filet, au cas où un état transitoire en
  // présenterait plusieurs : c'est alors le plus cher qui fait foi, celui dont
  // la période est déjà réglée.
  const live =
    actives.length > 1
      ? actives.slice().sort((a, b) => planPriceFromName(b.name) - planPriceFromName(a.name))[0]
      : actives[0]

  // ── Aucun abonnement actif chez Shopify ──────────────────────────────────
  if (!live) {
    // ⚠️ ANNULÉ, MAIS LA PÉRIODE PAYÉE COURT ENCORE.
    //
    // Shopify a bien coupé le renouvellement, mais le marchand a réglé son mois : il
    // garde son plan jusqu'à l'échéance (Shopify ne rembourse pas au prorata). On ne
    // le dégrade donc PAS tout de suite — sinon il perdrait ce qu'il a payé.
    const stillPaidFor =
      store.subscription_status === 'canceled' &&
      store.current_period_end &&
      new Date(store.current_period_end) > new Date()

    if (stillPaidFor) {
      return NextResponse.json({ data: { synced: false, plan: store.plan } })
    }

    // La période est écoulée (ou il n'a jamais payé) : retour au gratuit.
    if (store.subscription_status !== 'none' || store.plan !== 'free') {
      await admin
        .from('shopify_stores')
        .update({
          plan: 'free',
          pending_plan: null,
          subscription_status: 'none',
          shopify_charge_id: null,
          current_period_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', store.id)

      return NextResponse.json({ data: { synced: true, plan: 'free' } })
    }
    return NextResponse.json({ data: { synced: false, plan: store.plan } })
  }

  // ── Un abonnement EST actif : quel plan ? ────────────────────────────────
  //
  // Le nom de l'abonnement chez Shopify est « Xeyo <Plan> » ou « Xeyo <Plan>
  // (Annuel) » (cf. `subscribe`). On en déduit le plan, plutôt que de faire
  // confiance à notre propre base — qui est précisément ce qu'on cherche à corriger.
  //
  // ⚠️ COMPAT RENAME Growth → Pro : les abonnements créés AVANT le renommage
  // s'appellent « Xeyo Growth » et ne contiennent plus le libellé « pro ». On mappe
  // donc explicitement l'ancien nom vers le plan `pro` en plus des noms actuels.
  const name = (live.name || '').toLowerCase()
  const matched: PlanId | undefined =
    name.includes('growth') // ancien nom du plan Pro
      ? 'pro'
      : (Object.keys(PLANS) as PlanId[]).find(
          (id) => id !== 'free' && name.includes(PLANS[id].name.toLowerCase())
        )

  // Si le nom ne correspond à rien de connu, on garde ce qu'on avait plutôt que de
  // dégrader un marchand qui paie.
  const plan = matched || (store.pending_plan as PlanId) || (store.plan as PlanId)

  // ⚠️ NE PAS PRÉCIPITER UNE BAISSE PROGRAMMÉE.
  //
  // Sur `APPLY_ON_NEXT_BILLING_CYCLE`, deux abonnements coexistent brièvement chez
  // Shopify : l'ancien (qui court jusqu'à l'échéance) et le nouveau (qui prendra le
  // relais). Si cette resynchro tombait sur le nouveau, elle appliquerait la baisse
  // sur-le-champ — exactement ce que le différé cherche à éviter.
  //
  // Tant que la période payée court et qu'une baisse est programmée, on ne touche à
  // rien : c'est le webhook d'abonnement qui basculera le jour venu.
  const currentPrice = PLANS[(store.plan || 'free') as PlanId]?.priceEur ?? 0
  const newPrice = PLANS[plan]?.priceEur ?? 0
  const periodStillRunning =
    !!store.current_period_end && new Date(store.current_period_end) > new Date()

  // FILET DE SÉCURITÉ : ne jamais descendre un marchand sous ce qu'il a payé
  // tant que sa période court. On ne fait que s'abstenir — la baisse est
  // décidée par `subscribe` et mémorisée dans `pending_plan` ; la déduire ici
  // reviendrait à programmer une rétrogradation que personne n'a demandée.
  if (periodStillRunning && newPrice < currentPrice) {
    return NextResponse.json({ data: { synced: false, plan: store.plan } })
  }

  const alreadyCorrect =
    store.subscription_status === 'active' &&
    store.plan === plan &&
    store.shopify_charge_id === live.id

  if (alreadyCorrect) {
    return NextResponse.json({ data: { synced: false, plan } })
  }

  // ⚠️ NE PAS EFFACER UNE BAISSE PROGRAMMÉE — c'était LE bug.
  //
  // Vérifié sur l'API : avec `APPLY_ON_NEXT_BILLING_CYCLE`, Shopify n'expose
  // qu'UN SEUL abonnement actif — l'ANCIEN. Le nouveau n'est créé qu'au
  // prochain cycle. (Contrairement à ce qu'on supposait, les deux ne
  // coexistent pas.)
  //
  // Cette resynchro voyait donc « Xeyo Scale » chez Shopify, en concluait que
  // le plan est Scale — et remettait `pending_plan` à null au passage,
  // détruisant la mémoire de la baisse à venir. Résultat : la rétrogradation
  // n'arrivait JAMAIS, et l'app affichait le mauvais plan.
  //
  // On ne l'efface que si la baisse a réellement pris effet, c'est-à-dire
  // quand Shopify facture enfin le plan qui attendait.
  const pendingApplied = store.pending_plan && store.pending_plan === plan

  await admin
    .from('shopify_stores')
    .update({
      plan,
      ...(pendingApplied || !store.pending_plan ? { pending_plan: null } : {}),
      subscription_status: 'active',
      shopify_charge_id: live.id,
      billing_source: 'shopify',
      // Réaligne aussi l'intervalle (mensuel/annuel) sur ce que Shopify facture
      // réellement — sinon un changement d'intervalle rattrapé par le sync
      // laissait `billing_interval` faux (prix/affichage incohérents).
      ...(live.interval ? { billing_interval: live.interval } : {}),
      current_period_end: live.currentPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  console.log('[billing/sync]', shop, '→ réaligné sur Shopify :', plan)

  return NextResponse.json({ data: { synced: true, plan } })
}
