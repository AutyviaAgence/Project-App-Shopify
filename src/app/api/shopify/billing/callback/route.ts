import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, getShopifyConfig, getAppSubscriptionStatus } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { PLANS, type PlanId } from '@/lib/shopify/plans'

/**
 * GET /api/shopify/billing/callback?shop=…&plan=…
 * Retour après confirmation du paiement par le marchand (Billing API).
 *
 * ⚠️ SÉCURITÉ : ne JAMAIS faire confiance aux query params seuls. On vérifie
 * auprès de Shopify que l'abonnement (charge_id stocké au subscribe) est bien
 * ACTIVE avant d'activer le plan — sinon n'importe qui pourrait forger ce
 * callback (?shop=X&plan=scale) et débloquer un plan payant sans payer.
 */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop')
  const plan = req.nextUrl.searchParams.get('plan') as PlanId | null

  if (!shop || !isValidShopDomain(shop) || !plan || !(plan in PLANS)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Récupérer l'abonnement en attente (créé par /subscribe) + le token.
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, user_id, access_token, shopify_charge_id, pending_plan, plan, subscription_status')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.access_token || !store.shopify_charge_id) {
    return NextResponse.json({ error: 'Aucun abonnement en attente pour cette boutique.' }, { status: 400 })
  }

  // VÉRIFICATION auprès de Shopify : l'abonnement doit être ACTIVE.
  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux — ici le plan payé ne serait JAMAIS
  // activé. getValidAccessToken le rafraîchit ; si null, on remonte une erreur
  // explicite au marchand plutôt que d'échouer en silence.
  const token = await getValidAccessToken(shop)
  if (!token) {
    return NextResponse.json(
      { error: 'Jeton Shopify invalide — rouvrez l\'application depuis l\'admin Shopify pour la reconnecter, puis réessayez.' },
      { status: 502 }
    )
  }
  const sub = await getAppSubscriptionStatus(shop, token, store.shopify_charge_id)
  if (!sub || sub.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: `Abonnement non confirmé (statut : ${sub?.status || 'inconnu'}).` },
      { status: 402 }
    )
  }

  // La VRAIE date de fin de période, demandée à Shopify.
  //
  // Elle était calculée en `+30 jours` en dur. C'est faux dès qu'il y a une
  // période d'essai (code promo, récompense de parrainage) : le marchand serait
  // considéré comme expiré alors que son abonnement court toujours.
  const { listActiveSubscriptions } = await import('@/lib/shopify/client')
  const active = await listActiveSubscriptions(shop, token)
  const current = active.find((s) => s.id === store.shopify_charge_id)

  const periodEnd = current?.currentPeriodEnd
    ? new Date(current.currentPeriodEnd)
    : (() => {
        const d = new Date()
        d.setDate(d.getDate() + 30)
        return d
      })()

  // Le plan à activer est celui qui ATTENDAIT l'approbation. On retombe sur le
  // paramètre d'URL uniquement pour les abonnements créés avant ce correctif.
  const activatedPlan = store.pending_plan || plan

  // ⚠️ BAISSE DE PLAN : elle ne prend effet qu'au PROCHAIN CYCLE.
  //
  // Shopify a bien approuvé le nouvel abonnement, mais avec
  // `APPLY_ON_NEXT_BILLING_CYCLE` : l'ancien continue de courir jusqu'à la fin de
  // la période déjà payée. Activer le plan inférieur maintenant briderait le
  // marchand alors qu'il a réglé le tarif supérieur pour tout le mois.
  //
  // On garde donc son plan actuel, et `pending_plan` mémorise le plan visé — c'est
  // le webhook d'abonnement qui basculera le jour venu.
  const currentPrice = PLANS[(store.plan || 'free') as PlanId]?.priceEur ?? 0
  const newPrice = PLANS[activatedPlan as PlanId]?.priceEur ?? 0
  const isDeferredDowngrade = store.subscription_status === 'active' && newPrice < currentPrice

  await admin
    .from('shopify_stores')
    .update({
      plan: isDeferredDowngrade ? store.plan : activatedPlan,
      pending_plan: isDeferredDowngrade ? activatedPlan : null,
      subscription_status: 'active',
      billing_source: 'shopify',
      current_period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  // ── Code promo : on ne l'enregistre qu'ICI ────────────────────────────────
  // Le paiement vient d'être CONFIRMÉ par Shopify. Enregistrer l'utilisation
  // plus tôt permettrait de « brûler » un code sans jamais payer.
  const promoId = req.nextUrl.searchParams.get('promo')
  if (promoId && store.user_id) {
    try {
      const { redeemPromoCode } = await import('@/lib/shopify/billing')
      await redeemPromoCode(promoId, store.user_id, store.shopify_charge_id)
    } catch (e) {
      // Ne doit jamais empêcher l'activation d'un plan déjà payé.
      console.error('[billing/callback] enregistrement du code promo échoué (non bloquant):', e)
    }
  }

  // ── Parrainage / affiliation ──────────────────────────────────────────────
  // C'est LE point de déclenchement unique des récompenses : le premier paiement
  // confirmé. Idempotent (contrainte d'unicité en base) : un callback rejoué ne
  // verse pas deux fois.
  if (store.user_id) {
    try {
      const { settleAttribution } = await import('@/lib/growth/engine')
      await settleAttribution(store.user_id, shop)
    } catch (e) {
      console.error('[billing/callback] attribution échouée (non bloquant):', e)
    }
  }

  const { appUrl } = getShopifyConfig()
  return NextResponse.redirect(`${appUrl}/shopify?shop=${encodeURIComponent(shop)}&subscribed=1`)
}
