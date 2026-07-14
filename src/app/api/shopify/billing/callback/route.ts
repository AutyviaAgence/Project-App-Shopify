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
    .select('id, access_token, shopify_charge_id')
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

  const periodEnd = new Date()
  periodEnd.setDate(periodEnd.getDate() + 30)

  await admin
    .from('shopify_stores')
    .update({
      plan,
      subscription_status: 'active',
      billing_source: 'shopify',
      current_period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  const { appUrl } = getShopifyConfig()
  return NextResponse.redirect(`${appUrl}/shopify?shop=${encodeURIComponent(shop)}&subscribed=1`)
}
