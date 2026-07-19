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
  // ⚠️ `.order().limit(1)` et PAS `.maybeSingle()` seul : un compte relié à DEUX
  // boutiques actives (réinstallation où l'ancienne ligne n'a pas été désactivée)
  // faisait renvoyer une ERREUR PostgREST à maybeSingle → store=null → marchand
  // traité comme non-facturé, IA coupée alors qu'il paie. On prend la plus récente.
  const { data: store } = await admin()
    .from('shopify_stores')
    .select('billing_source, shop_domain')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
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
    .select('plan, billing_source, subscription_status, current_period_end')
    .eq('user_id', userId)
    .eq('is_active', true)
    // Deux boutiques actives (réinstallation) → maybeSingle seul planterait. On
    // prend la plus récente. Cf. getShopifyBilling.
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (store?.billing_source === 'shopify') {
    // Abonnement en cours : le plan s'applique.
    if (store.subscription_status === 'active') {
      return GRID[resolvePlan(store.plan)]
    }

    // ⚠️ ANNULÉ ≠ COUPÉ IMMÉDIATEMENT.
    //
    // Un abonnement annulé retombait aussitôt en gratuit. Le marchand perdait donc
    // l'accès qu'il venait de PAYER : Shopify ne rembourse pas au prorata, il avait
    // réglé son mois et se retrouvait bridé le jour même. Double peine.
    //
    // Le renouvellement est bien coupé chez Shopify ; il profite simplement de ce
    // qu'il a payé jusqu'à l'échéance. Passé cette date, retour au gratuit.
    if (store.subscription_status === 'canceled' && store.current_period_end) {
      if (new Date(store.current_period_end) > new Date()) {
        return GRID[resolvePlan(store.plan)]
      }
    }

    // Tout le reste retombe sur le gratuit :
    //  · `pending` — le marchand n'a pas (encore) approuvé la charge. Sans ce filtre,
    //    on lui accorderait un plan payant jamais réglé.
    //  · `frozen`  — impayé, Shopify a gelé l'abonnement.
    //  · `null`    — après une désinstallation, où `plan` garde pourtant sa valeur.
    return GRID.free
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
  /** Quota MENSUEL du plan seul (remis à zéro chaque mois). */
  planLimit: number | null
  /** Conversations ACHETÉES en recharge (ne périment pas). */
  extra: number
}> {
  const plan = await getUserPlan(userId)

  // Illimité (fair-use)
  if (plan.conversationsPerMonth === null) {
    const used = await countAiConversationsThisMonth(userId)
    if (plan.fairUseCap && used >= plan.fairUseCap) {
      await alertFairUseOnce(userId, used, plan.fairUseCap)
    }
    return { allowed: true, used, limit: Infinity, plan: plan.id, planLimit: null, extra: 0 }
  }

  // Crédits achetés en plus (ne périment pas) → s'ajoutent au quota mensuel.
  const supabase = admin()
  const { data: prof } = await supabase
    .from('profiles').select('ai_conversations_extra').eq('id', userId).maybeSingle()
  const extra = (prof as { ai_conversations_extra?: number } | null)?.ai_conversations_extra || 0

  const used = await countAiConversationsThisMonth(userId)
  const limit = plan.conversationsPerMonth + extra
  // `limit` reste le TOTAL (c'est lui qui autorise ou bloque l'IA) ; `planLimit`
  // et `extra` sont exposés en plus pour que l'UI puisse les afficher séparément
  // — le quota du plan se remet à zéro chaque mois, les recharges non.
  return { allowed: used < limit, used, limit, plan: plan.id, planLimit: plan.conversationsPerMonth, extra }
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
