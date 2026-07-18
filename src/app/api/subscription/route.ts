import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PLANS, resolvePlan } from '@/lib/plans'

/** GET /api/subscription — Récupérer le statut d'abonnement de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_status, trial_ends_at, subscription_ends_at, stripe_customer_id, stripe_subscription_id, tokens_used, tokens_limit, tokens_extra, plan, pending_plan, role, audit_status, onboarding_plan')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }

  // Récupérer si le configurateur a été soumis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: onboardingConfig } = await (supabase as any)
    .from('onboarding_configs')
    .select('submitted_at')
    .eq('user_id', user.id)
    .maybeSingle() as { data: { submitted_at: string | null } | null }

  // aiEnabled : l'IA (agent, génération, assistant) est-elle disponible ?
  // Vrai pour les plans payants, ET pendant un trial actif. Sert au front à
  // griser les actions premium sur le plan Gratuit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profile as any
  const plan = resolvePlan(p.plan)
  const trialing = p.subscription_status === 'trialing' &&
    (!p.trial_ends_at || new Date(p.trial_ends_at) > new Date())
  const aiEnabled = p.role === 'admin' || trialing || PLANS[plan].aiEnabled

  // Marchand facturé par Shopify ? Le front s'en sert pour MASQUER tous les CTA
  // Stripe (checkout, packs de crédits) : sur l'App Store, le billing hors
  // plateforme est interdit — ces marchands passent par la Billing API.
  const { getShopifyBilling } = await import('@/lib/shopify/plans')
  const { billed: shopifyBilled, shopDomain } = await getShopifyBilling(user.id)

  // ⚠️ LA VÉRITÉ EST DANS `shopify_stores`, PAS DANS `profiles`.
  //
  // La page d'abonnement lisait `profiles.subscription_ends_at` — une colonne
  // héritée de Stripe, jamais mise à jour pour un marchand Shopify. D'où le
  // « prochain renouvellement : 1 janvier 2100 » (26 834 jours restants), et un
  // plan/statut qui pouvaient contredire la facturation réelle.
  //
  // Pour un marchand Shopify, le plan, le statut et la date de renouvellement
  // vivent dans `shopify_stores` — c'est ce que le callback de facturation et le
  // webhook d'abonnement tiennent à jour.
  let periodEnd: string | null = null
  let realPlan = plan
  let realStatus = p.subscription_status as string | null

  if (shopifyBilled) {
    const { createClient: createAdminSupabase } = await import('@supabase/supabase-js')
    const admin = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: store } = await admin
      .from('shopify_stores')
      .select('plan, subscription_status, current_period_end, pending_plan, billing_interval')
      .eq('user_id', user.id)
      .eq('is_active', true)
      // Deux boutiques actives → maybeSingle seul planterait. On prend la plus récente.
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (store) {
      realPlan = (store.plan || 'free') as typeof plan
      realStatus = store.subscription_status
      periodEnd = store.current_period_end
    }
  }

  return NextResponse.json({
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(profile as any),
      plan: realPlan,
      subscription_status: realStatus,
      /** Vraie date de renouvellement (Shopify), `null` si aucun abonnement. */
      current_period_end: periodEnd,
      configurateur_submitted: !!onboardingConfig?.submitted_at,
      aiEnabled,
      shopifyBilled,
      shopDomain,
    }
  })
}
