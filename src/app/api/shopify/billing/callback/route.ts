import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, getShopifyConfig } from '@/lib/shopify/client'
import { PLANS, type PlanId } from '@/lib/shopify/plans'

/**
 * GET /api/shopify/billing/callback?shop=…&plan=…
 * Retour après confirmation du paiement par le marchand (Billing API).
 * Marque l'abonnement actif et redirige vers l'app embedded.
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

  // Active l'abonnement (Shopify a confirmé le paiement avant de rediriger ici).
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
    .eq('shop_domain', shop)

  const { appUrl } = getShopifyConfig()
  return NextResponse.redirect(`${appUrl}/shopify?shop=${encodeURIComponent(shop)}&subscribed=1`)
}
