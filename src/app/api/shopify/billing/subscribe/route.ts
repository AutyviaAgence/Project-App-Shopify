import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, createAppSubscription, getShopifyConfig } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { PLANS, PAID_PLANS, type PlanId } from '@/lib/shopify/plans'

/**
 * POST /api/shopify/billing/subscribe  { shop, plan }
 * Crée un abonnement Shopify pour un plan payant et renvoie l'URL de
 * confirmation (le marchand approuve le paiement côté Shopify).
 *
 * ⚠️ Règle anti-contournement : pour une boutique Shopify, on facture
 * OBLIGATOIREMENT via la Billing API (jamais en direct).
 */
export async function POST(req: NextRequest) {
  // SÉCURITÉ : action de facturation → utilisateur authentifié + propriétaire de la
  // boutique. Auth UNIFIÉE : session token Shopify (admin embedded) OU cookie
  // (dashboard web). Avant, la route exigeait un cookie → elle répondait 401 depuis
  // l'iframe : le marchand ne pouvait PAS s'abonner depuis l'admin Shopify
  // (requirements 1.1.1 et 1.2.3).
  const { getAuthedUser } = await import('@/lib/shopify/embedded-auth')
  const authed = await getAuthedUser(req)
  if (!authed) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { shop?: string; plan?: PlanId }
  // En embedded, la boutique vient du SESSION TOKEN (source sûre), pas du corps.
  const shop = authed.shop || body.shop
  const plan = body.plan

  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Paramètre shop invalide' }, { status: 400 })
  }
  if (!plan || !PAID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // La boutique doit appartenir à l'utilisateur (filtre explicite : en embedded il
  // n'y a pas de RLS, c'est le code qui garantit l'isolation).
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.access_token) {
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  }

  const token = decryptMessage(store.access_token)
  const planDef = PLANS[plan]
  const { appUrl } = getShopifyConfig()
  const returnUrl = `${appUrl}/api/shopify/billing/callback?shop=${encodeURIComponent(shop)}&plan=${plan}`

  // test:true tant que l'app n'est pas publiée (pas de vraie facturation en dev)
  const isProd = process.env.NODE_ENV === 'production' && process.env.SHOPIFY_BILLING_TEST !== 'true'

  const result = await createAppSubscription(shop, token, {
    name: `Xeyo ${planDef.name}`,
    price: planDef.priceEur,
    currencyCode: 'EUR',
    returnUrl,
    test: !isProd,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  const sub = result.data.appSubscriptionCreate
  if (sub.userErrors.length > 0 || !sub.confirmationUrl) {
    return NextResponse.json({ error: sub.userErrors[0]?.message || 'Erreur Billing Shopify' }, { status: 502 })
  }

  // Marquer pending en attendant la confirmation
  await admin
    .from('shopify_stores')
    .update({
      plan,
      subscription_status: 'pending',
      shopify_charge_id: sub.appSubscription?.id ?? null,
      billing_source: 'shopify',
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  return NextResponse.json({ data: { confirmationUrl: sub.confirmationUrl } })
}
