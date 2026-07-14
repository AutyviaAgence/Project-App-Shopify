import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PLANS, type PlanId } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/**
 * Vue admin de la facturation.
 *
 * ⚠️ CE QUI ÉTAIT CASSÉ.
 *
 * Cette route ne listait que les comptes ayant un `stripe_customer_id`
 * (`.not('stripe_customer_id', 'is', null)`), puis interrogeait Stripe. Or un
 * marchand Shopify n'a PAS de client Stripe : il était donc totalement INVISIBLE
 * dans la vue de facturation. Comme l'onboarding impose une boutique Shopify,
 * l'admin ne voyait en pratique aucun de ses vrais clients.
 *
 * La source de vérité est `shopify_stores` : c'est le callback de facturation et
 * le webhook d'abonnement qui la tiennent à jour.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Les boutiques et leur facturation réelle.
  const { data: stores } = await admin
    .from('shopify_stores')
    .select('id, user_id, shop_domain, shop_name, plan, pending_plan, subscription_status, current_period_end, shopify_charge_id, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const rows = stores || []
  const userIds = rows.map((s) => s.user_id).filter(Boolean) as string[]

  const { data: owners } = userIds.length
    ? await admin.from('profiles').select('id, email, full_name').in('id', userIds)
    : { data: [] }

  const ownerById = new Map((owners || []).map((o) => [o.id, o]))

  const subscriptions = rows.map((s) => {
    const owner = s.user_id ? ownerById.get(s.user_id) : null
    const planId = (s.plan || 'free') as PlanId
    const priceEur = PLANS[planId]?.priceEur ?? 0

    return {
      id: s.id,
      userId: s.user_id,
      email: owner?.email ?? null,
      fullName: owner?.full_name ?? null,
      shopDomain: s.shop_domain,
      shopName: s.shop_name,
      plan: planId,
      /** Plan en attente d'approbation Shopify (le marchand n'a pas encore validé). */
      pendingPlan: s.pending_plan,
      status: s.subscription_status,
      priceEur,
      currentPeriodEnd: s.current_period_end,
      chargeId: s.shopify_charge_id,
      createdAt: s.created_at,
      /** Facturé via Shopify — c'est le cas de tous les marchands désormais. */
      source: 'shopify' as const,
    }
  })

  // Les achats ponctuels (packs de tokens et de conversations IA).
  const { data: purchases } = await admin
    .from('shopify_one_time_purchases')
    .select('id, user_id, shop_domain, pack, status, price_cents, amount_credited, credited_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const mrrCents = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + Math.round(s.priceEur * 100), 0)

  return NextResponse.json({
    data: {
      subscriptions,
      purchases: purchases || [],
      totals: {
        /** Revenu mensuel récurrent, en centimes. */
        mrrCents,
        activeCount: subscriptions.filter((s) => s.status === 'active').length,
        /** Abonnements créés mais jamais approuvés par le marchand. */
        pendingCount: subscriptions.filter((s) => s.status === 'pending').length,
        /** Impayés : Shopify a gelé l'abonnement. */
        frozenCount: subscriptions.filter((s) => s.status === 'frozen').length,
      },
    },
  })
}
