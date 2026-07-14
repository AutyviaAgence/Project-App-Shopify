import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'

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
    .select('id, shopify_charge_id, plan, pending_plan')
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

  // ── L'abonnement est mort : retour au plan gratuit ────────────────────────
  if (['CANCELLED', 'DECLINED', 'EXPIRED'].includes(status)) {
    await supabase
      .from('shopify_stores')
      .update({
        plan: 'free',
        subscription_status: 'canceled',
        shopify_charge_id: null,
        pending_plan: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id)

    console.log('[webhook/app-subscriptions]', shopDomain, '→', status, ': retour au plan gratuit')
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
    const targetPlan = store.pending_plan || store.plan
    await supabase
      .from('shopify_stores')
      .update({
        plan: targetPlan,
        subscription_status: 'active',
        shopify_charge_id: chargeId,
        pending_plan: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id)

    console.log('[webhook/app-subscriptions]', shopDomain, '→ actif :', targetPlan)
  }

  return NextResponse.json({ received: true })
}
