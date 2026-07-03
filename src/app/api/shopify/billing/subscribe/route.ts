import { NextRequest, NextResponse } from 'next/server'
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
  const { shop, plan } = (await req.json().catch(() => ({}))) as { shop?: string; plan?: PlanId }

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

  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
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
