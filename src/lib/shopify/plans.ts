import 'server-only'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { PLANS as GRID, resolvePlan, type PlanId, type PlanDef } from '@/lib/plans'

/**
 * Quotas de conversations IA (grille unifiée @/lib/plans).
 *
 * Unité vendue : "conversation traitée" = conversation où l'agent IA a généré
 * au moins une réponse (comptée une fois par mois). Garde-fou interne : tokens
 * (profiles.tokens_limit/tokens_used, backstop silencieux).
 *
 * Le plan free n'a AUCUNE IA (gating via @/lib/plans/gate). Scale est
 * « illimité » fair-use : au-delà de fairUseCap on ALERTE (1×/mois) sans
 * jamais bloquer.
 */

export type { PlanId } from '@/lib/plans'
export { PLANS, PAID_PLANS } from '@/lib/plans'

function admin() {
  return getAdminSupabase()
}

/**
 * Compte les conversations traitées par l'IA ce mois-ci pour un utilisateur.
 * = nombre de conversations distinctes ayant au moins un message sortant IA
 * (sent_by = 'ai_agent') depuis le début du mois. Auto-reset mensuel par
 * construction (fenêtre depuis le 1er du mois).
 */
export async function countAiConversationsThisMonth(userId: string): Promise<number> {
  const supabase = admin()

  // Sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', userId)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) return 0

  const periodStart = new Date()
  periodStart.setDate(1)
  periodStart.setHours(0, 0, 0, 0)

  // Conversations distinctes avec au moins un message IA ce mois-ci
  const { data: msgs } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('session_id', sessionIds)
    .eq('sent_by', 'ai_agent')
    .gte('created_at', periodStart.toISOString())

  const distinct = new Set((msgs || []).map((m) => m.conversation_id))
  return distinct.size
}

/**
 * Vrai si l'utilisateur est un marchand facturé PAR SHOPIFY (boutique active avec
 * billing_source='shopify').
 *
 * ⚠️ CONFORMITÉ SHOPIFY — App Store requirement §1.2/§1.2.1 : une app publiée sur
 * l'App Store doit facturer via une solution Shopify ; le billing hors plateforme
 * (Stripe) est interdit et vaut rejet/suspension. On s'en sert pour BLOQUER tous
 * les chemins de paiement Stripe pour ces marchands.
 */
export async function isShopifyBilled(userId: string): Promise<boolean> {
  return (await getShopifyBilling(userId)).billed
}

/** Facturation Shopify + domaine de la boutique (pour rediriger vers la Billing API). */
export async function getShopifyBilling(userId: string): Promise<{ billed: boolean; shopDomain: string | null }> {
  const { data: store } = await admin()
    .from('shopify_stores')
    .select('billing_source, shop_domain')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return {
    billed: store?.billing_source === 'shopify',
    shopDomain: store?.shop_domain ?? null,
  }
}

/**
 * Détermine le plan effectif d'un utilisateur (grille unifiée).
 * Source de vérité : billing_source. Si shopify → plan de shopify_stores
 * ('growth' legacy → 'pro') ; sinon → profiles.plan. Défaut : free (IA OFF).
 */
export async function getUserPlan(userId: string): Promise<PlanDef> {
  const supabase = admin()

  // Boutique Shopify liée ?
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('plan, billing_source, subscription_status')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (store?.billing_source === 'shopify') {
    // ⚠️ Le plan ne compte QUE si l'abonnement est réellement actif chez Shopify.
    //
    // `subscribe` écrit `plan = <payant>` + `subscription_status = 'pending'` AVANT
    // que le marchand ne confirme la charge. S'il la refuse (ou abandonne l'écran
    // Shopify), la ligne reste telle quelle. Sans ce filtre, on lui accordait le
    // plan payant sans jamais être payé — et pareil après une désinstallation, où
    // `subscription_status` repasse à NULL mais `plan` garde sa valeur.
    //
    // Seul 'active' ouvre les droits ; tout le reste (pending, null, cancelled)
    // retombe sur le plan gratuit.
    if (store.subscription_status !== 'active') return GRID.free
    return GRID[resolvePlan(store.plan)]
  }

  // Sinon plan direct (profiles.plan) — défaut free
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()

  return GRID[resolvePlan(profile?.plan)]
}

/**
 * Vérifie si l'utilisateur peut encore faire répondre l'IA (quota conversations).
 * - Plans à quota : allowed=false quand used >= limit.
 * - Scale (illimité fair-use) : TOUJOURS allowed ; au-delà de fairUseCap,
 *   une alerte 'fair_use_reached' est insérée (1×/mois) pour ouvrir la
 *   discussion sur-mesure — sans couper l'IA (promesse « illimité »).
 */
export async function checkConversationQuota(userId: string): Promise<{
  allowed: boolean
  used: number
  limit: number
  plan: PlanId
}> {
  const plan = await getUserPlan(userId)

  // Illimité (fair-use)
  if (plan.conversationsPerMonth === null) {
    const used = await countAiConversationsThisMonth(userId)
    if (plan.fairUseCap && used >= plan.fairUseCap) {
      await alertFairUseOnce(userId, used, plan.fairUseCap)
    }
    return { allowed: true, used, limit: Infinity, plan: plan.id }
  }

  // Crédits achetés en plus (ne périment pas) → s'ajoutent au quota mensuel.
  const supabase = admin()
  const { data: prof } = await supabase
    .from('profiles').select('ai_conversations_extra').eq('id', userId).maybeSingle()
  const extra = (prof as { ai_conversations_extra?: number } | null)?.ai_conversations_extra || 0

  const used = await countAiConversationsThisMonth(userId)
  const limit = plan.conversationsPerMonth + extra
  return { allowed: used < limit, used, limit, plan: plan.id }
}

/** Alerte fair-use dédupliquée : une seule par mois calendaire. */
async function alertFairUseOnce(userId: string, used: number, cap: number): Promise<void> {
  try {
    const supabase = admin()
    const periodStart = new Date()
    periodStart.setDate(1)
    periodStart.setHours(0, 0, 0, 0)

    const { data: existing } = await supabase
      .from('user_alerts')
      .select('id')
      .eq('user_id', userId)
      .eq('alert_type', 'fair_use_reached')
      .gte('created_at', periodStart.toISOString())
      .limit(1)
      .maybeSingle()
    if (existing) return

    await supabase.from('user_alerts').insert({
      user_id: userId,
      alert_type: 'fair_use_reached',
      title: 'Volume élevé ce mois-ci',
      message: `Vous avez dépassé ${cap} conversations IA ce mois-ci (${used}). Votre service continue normalement, contactez-nous pour un accompagnement adapté à votre volume.`,
      metadata: { used, cap },
    })
  } catch (err) {
    console.error('[plans] alerte fair-use:', err)
  }
}
