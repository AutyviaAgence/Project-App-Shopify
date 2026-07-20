import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { PLANS, type PlanId } from '@/lib/shopify/plans'

/**
 * Plan réellement facturé, déduit du NOM de l'abonnement Shopify.
 *
 * Format posé par `subscribe` : « Xeyo <Plan> » ou « Xeyo <Plan> (Annuel) ».
 * C'est la seule source fiable pour savoir ce que Shopify facture MAINTENANT —
 * notre `pending_plan` dit seulement ce qui est prévu.
 *
 * ⚠️ Compat rename Growth → Pro : les abonnements antérieurs s'appellent
 * « Xeyo Growth » et ne contiennent plus le libellé « pro ».
 */
function planFromSubscriptionName(name: string): PlanId | null {
  const n = (name || '').toLowerCase()
  if (!n) return null
  if (n.includes('growth')) return 'pro'
  return (
    (Object.keys(PLANS) as PlanId[]).find(
      (id) => id !== 'free' && n.includes(PLANS[id].name.toLowerCase())
    ) ?? null
  )
}

/**
 * Webhook Shopify — app_subscriptions/update.
 *
 * ⚠️ CE WEBHOOK N'EXISTAIT PAS. C'ÉTAIT UNE FUITE DE REVENUS.
 *
 * Un marchand peut annuler son abonnement DEPUIS L'ADMIN SHOPIFY (Paramètres →
 * Facturation), sans jamais passer par Xeyo. Sans ce webhook, on ne l'apprenait
 * jamais : il gardait son plan payant indéfiniment, avec toutes les
 * fonctionnalités, sans plus rien payer.
 *
 * Le même trou concernait les impayés (`FROZEN`) : Shopify gèle l'abonnement,
 * Xeyo continuait de servir le plan comme si de rien n'était.
 *
 * C'est aussi le seul moyen d'apprendre qu'un abonnement en attente a EXPIRÉ —
 * Shopify l'annule si le marchand ne l'approuve pas sous 48 h.
 *
 * ── STATUTS SHOPIFY ─────────────────────────────────────────────────────────
 *   ACTIVE    → l'abonnement court
 *   PENDING   → créé, en attente d'approbation
 *   DECLINED  → le marchand a refusé
 *   EXPIRED   → non approuvé dans les 48 h
 *   CANCELLED → annulé
 *   FROZEN    → impayé (la boutique est gelée côté Shopify)
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  if (!shopDomain) return NextResponse.json({ received: true })

  let payload: { app_subscription?: { admin_graphql_api_id?: string; status?: string; name?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ received: true })
  }

  const sub = payload.app_subscription
  const chargeId = sub?.admin_graphql_api_id
  const status = (sub?.status || '').toUpperCase()
  if (!chargeId || !status) return NextResponse.json({ received: true })

  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    // `user_id` : requis pour régler la récompense de parrainage (voir plus bas).
    // `current_period_end` : sans lui, impossible de savoir si l'accès est
    // encore payé — et on couperait un plan déjà réglé.
    .select('id, user_id, shopify_charge_id, plan, pending_plan, current_period_end')
    .eq('shop_domain', shopDomain)
    .maybeSingle()

  if (!store) return NextResponse.json({ received: true })

  // ⚠️ Ne traiter que l'abonnement que NOUS suivons.
  //
  // Lors d'un changement de plan, deux abonnements coexistent brièvement chez
  // Shopify (l'ancien est annulé, le nouveau démarre). Sans ce filtre, le
  // webhook `CANCELLED` de l'ANCIEN abonnement arriverait après l'activation du
  // nouveau et remettrait le marchand en gratuit — alors qu'il vient justement
  // de monter en gamme.
  //
  // Exception : un abonnement en attente (`pending_plan`) n'est pas encore
  // enregistré comme `shopify_charge_id` — on doit quand même traiter son
  // expiration, sinon `pending_plan` resterait bloqué pour toujours.
  const isTrackedCharge = store.shopify_charge_id === chargeId
  const isPendingCharge = !!store.pending_plan && !store.shopify_charge_id

  if (!isTrackedCharge && !isPendingCharge) {
    console.log('[webhook/app-subscriptions]', shopDomain, status, '→ ignoré (autre abonnement)')
    return NextResponse.json({ received: true })
  }

  // ── L'abonnement est mort ─────────────────────────────────────────────────
  //
  // ⚠️ NE PAS COUPER UN ACCÈS DÉJÀ PAYÉ.
  //
  // On écrivait `plan: 'free'` sur-le-champ. Or Shopify ne rembourse pas au
  // prorata : un marchand qui résilie le 5 a réglé jusqu'au 30 et doit garder
  // son plan jusque-là. C'est exactement ce que fait /billing/cancel — et ce
  // webhook, déclenché juste après, défaisait son travail quelques secondes
  // plus tard.
  //
  // On coupe donc le renouvellement sans toucher au `plan` : `getUserPlan`
  // accorde l'accès tant que `current_period_end` court, puis bascule seul.
  if (['CANCELLED', 'DECLINED', 'EXPIRED'].includes(status)) {
    const stillPaidFor =
      !!store.current_period_end && new Date(store.current_period_end) > new Date()

    await supabase
      .from('shopify_stores')
      .update({
        // Période encore réglée → on garde le plan. Sinon (ou refus d'une
        // souscription jamais payée) → retour au gratuit.
        ...(stillPaidFor ? {} : { plan: 'free' }),
        subscription_status: 'canceled',
        shopify_charge_id: null,
        pending_plan: stillPaidFor ? 'free' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id)

    console.log(
      '[webhook/app-subscriptions]', shopDomain, '→', status,
      stillPaidFor ? `: accès conservé jusqu'au ${store.current_period_end}` : ': retour au plan gratuit'
    )
    return NextResponse.json({ received: true })
  }

  // ── Impayé : Shopify a gelé l'abonnement ─────────────────────────────────
  //
  // On ne repasse PAS en `free` : l'abonnement existe toujours et peut redevenir
  // actif dès que le marchand régularise. Mais comme le contrôle de quota exige
  // `active`, il est de fait limité au plan gratuit tant que ce n'est pas réglé.
  if (status === 'FROZEN') {
    await supabase
      .from('shopify_stores')
      .update({ subscription_status: 'frozen', updated_at: new Date().toISOString() })
      .eq('id', store.id)

    console.log('[webhook/app-subscriptions]', shopDomain, '→ gelé (impayé)')
    return NextResponse.json({ received: true })
  }

  // ── Actif : filet de sécurité si le marchand a fermé l'onglet ─────────────
  //
  // Le callback de facturation reste le chemin normal. Mais si le marchand
  // approuve puis ferme son navigateur avant d'être redirigé, le callback n'est
  // jamais appelé : il aurait payé sans que son plan s'active. Ce webhook le
  // rattrape.
  if (status === 'ACTIVE') {
    // ⚠️ NE PAS APPLIQUER `pending_plan` LES YEUX FERMÉS.
    //
    // Ce webhook se déclenche DÈS L'APPROBATION, y compris sur une baisse
    // différée — où Shopify continue pourtant de facturer l'ancien plan
    // jusqu'à l'échéance. Appliquer `pending_plan` ici rétrogradait donc le
    // marchand sur-le-champ, alors qu'il a payé le plan supérieur.
    //
    // La vérité est le NOM de l'abonnement que Shopify facture (« Xeyo Pro »,
    // « Xeyo Scale (Annuel) »…). On ne bascule que lorsqu'il correspond
    // réellement au plan en attente.
    const billedPlan = planFromSubscriptionName(sub?.name || '')
    const pendingNowBilled = !!store.pending_plan && billedPlan === store.pending_plan

    // Si Shopify facture encore l'ancien plan, on garde le plan courant ET la
    // baisse en attente : elle s'appliquera au prochain passage du webhook,
    // quand le nouvel abonnement entrera réellement en vigueur.
    const targetPlan = pendingNowBilled
      ? store.pending_plan
      : (billedPlan || store.pending_plan || store.plan)
    const keepPending = !!store.pending_plan && !pendingNowBilled
    await supabase
      .from('shopify_stores')
      .update({
        plan: targetPlan,
        subscription_status: 'active',
        shopify_charge_id: chargeId,
        ...(keepPending ? {} : { pending_plan: null }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id)

    console.log('[webhook/app-subscriptions]', shopDomain, '→ actif :', targetPlan)

    // ── RATTRAPAGE DE LA RÉCOMPENSE DE PARRAINAGE ───────────────────────────
    //
    // Le callback de facturation ne verse RIEN tant que l'essai gratuit court
    // (sinon la récompense serait offerte à quelqu'un qui n'a pas payé). C'est
    // donc ici qu'elle est versée : ce webhook se déclenche à chaque changement
    // d'état de l'abonnement, notamment quand il devient réellement facturé à la
    // fin de l'essai. On revérifie l'essai auprès de Shopify avant de verser.
    // Idempotent (unicité en base) : les rappels répétés ne versent pas deux fois.
    if (store.user_id) {
      try {
        const { getValidAccessToken } = await import('@/lib/shopify/token')
        const { getAppSubscriptionStatus, isWithinTrial } = await import('@/lib/shopify/client')
        const token = await getValidAccessToken(shopDomain)
        if (token) {
          const live = await getAppSubscriptionStatus(shopDomain, token, chargeId)
          if (live && live.status === 'ACTIVE' && !isWithinTrial(live)) {
            const { settleAttribution } = await import('@/lib/growth/engine')
            await settleAttribution(store.user_id, shopDomain)
          }
        }
      } catch (e) {
        // Ne doit jamais faire échouer le webhook (Shopify rejouerait en boucle).
        console.error('[webhook/app-subscriptions] règlement parrainage échoué (non bloquant):', e)
      }
    }
  }

  return NextResponse.json({ received: true })
}
