import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, listActiveSubscriptions } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { PLANS, type PlanId } from '@/lib/shopify/plans'

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
  const live = active.find((s) => s.status === 'ACTIVE')

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
  // Le nom de l'abonnement chez Shopify est « Xeyo <Plan> » (cf. `subscribe`).
  // On en déduit le plan, plutôt que de faire confiance à notre propre base — qui
  // est précisément ce qu'on cherche à corriger.
  const name = (live.name || '').toLowerCase()
  const matched = (Object.keys(PLANS) as PlanId[]).find(
    (id) => id !== 'free' && name.includes(PLANS[id].name.toLowerCase())
  )

  // Si le nom ne correspond à rien de connu, on garde ce qu'on avait plutôt que de
  // dégrader un marchand qui paie.
  const plan = matched || (store.pending_plan as PlanId) || (store.plan as PlanId)

  const alreadyCorrect =
    store.subscription_status === 'active' &&
    store.plan === plan &&
    store.shopify_charge_id === live.id

  if (alreadyCorrect) {
    return NextResponse.json({ data: { synced: false, plan } })
  }

  await admin
    .from('shopify_stores')
    .update({
      plan,
      pending_plan: null,
      subscription_status: 'active',
      shopify_charge_id: live.id,
      billing_source: 'shopify',
      current_period_end: live.currentPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  console.log('[billing/sync]', shop, '→ réaligné sur Shopify :', plan)

  return NextResponse.json({ data: { synced: true, plan } })
}
