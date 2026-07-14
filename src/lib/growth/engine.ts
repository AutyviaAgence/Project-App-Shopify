import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { PLANS, type PlanId } from '@/lib/plans'
import { isPartnerApiConfigured, createAppCredit } from '@/lib/shopify/partner-api'
import { isTestBilling } from '@/lib/shopify/billing'

/**
 * MOTEUR DE CROISSANCE — parrainage et affiliation.
 *
 * ── CE QU'IL REMPLACE ───────────────────────────────────────────────────────
 *
 * Deux systèmes concurrents, dont aucun ne fonctionnait :
 *
 *  · L'affiliation était rompue au premier maillon : le lien de partage posait un
 *    cookie `referral_code`, mais la page d'abonnement en lisait un autre
 *    (`affiliate_code`) que RIEN ne posait. La fonction qui calculait les
 *    commissions n'a jamais tourné une seule fois en production.
 *
 *  · Le parrainage versait 500 000 tokens via un lire-puis-écrire non atomique
 *    (des crédits se perdaient), et uniquement depuis le webhook Stripe — donc
 *    jamais pour un marchand Shopify. Or ils le sont tous.
 *
 * Ici : UN code, UNE attribution (posée à l'inscription), UNE récompense (versée
 * au premier paiement confirmé). Deux natures de porteur, et c'est tout.
 *
 * ── LA RÉCOMPENSE DU PARRAIN ────────────────────────────────────────────────
 *
 * Un mois d'abonnement offert, sous forme d'AVOIR Shopify (`appCreditCreate`) :
 * Shopify le déduit automatiquement de sa prochaine facture. Le parrain n'a rien
 * à approuver, rien à cliquer.
 *
 * Pourquoi pas une période d'essai ? Parce qu'elle ne s'applique qu'à la CRÉATION
 * d'un abonnement. Pour un parrain déjà abonné, il faudrait recréer le sien — et
 * donc lui faire approuver un écran. S'il ne le fait pas sous 48 h, il perd sa
 * récompense. Une récompense qu'on peut perdre en l'ignorant n'en est pas une.
 *
 * Si le jeton Partner API n'est pas configuré, on bascule automatiquement sur des
 * crédits de conversations IA — purement interne, atomique, infaillible.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Récompense de repli quand l'avoir Shopify n'est pas disponible. */
const FALLBACK_AI_CREDITS = 500

/**
 * Verse la récompense liée à l'inscription d'un marchand, au moment de son
 * PREMIER PAIEMENT CONFIRMÉ.
 *
 * ⚠️ IDEMPOTENT. Appelé depuis le callback de facturation, qui peut être rejoué
 * (double-clic, rafraîchissement, retry réseau). L'unicité
 * `(attribution_id, beneficiary_role)` en base garantit qu'une récompense n'est
 * versée qu'une fois — c'est le schéma qui protège, pas ce code.
 *
 * Ne lève jamais : une récompense qui échoue ne doit JAMAIS empêcher
 * l'activation d'un plan déjà payé.
 */
export async function settleAttribution(userId: string, shop: string): Promise<void> {
  const supabase = admin()

  // Ce marchand a-t-il été amené par quelqu'un ?
  const { data: attribution } = await supabase
    .from('growth_attributions')
    .select('id, code_id, referee_id, converted_at')
    .eq('referee_id', userId)
    .maybeSingle()

  if (!attribution) return // inscription spontanée
  if (attribution.converted_at) return // déjà réglée

  const { data: code } = await supabase
    .from('growth_codes')
    .select('id, kind, owner_user_id, commission_percent, reward_months, is_active')
    .eq('id', attribution.code_id)
    .maybeSingle()

  if (!code || !code.is_active) return

  // Anti auto-parrainage : on ne se récompense pas soi-même.
  if (code.owner_user_id && code.owner_user_id === userId) {
    console.log('[growth] auto-parrainage refusé pour', userId)
    return
  }

  // Ce que le filleul vient réellement de payer — c'est l'assiette de la
  // commission. On le lit en base plutôt que de le recevoir en paramètre : un
  // appelant ne doit pas pouvoir gonfler une commission.
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('plan')
    .eq('shop_domain', shop)
    .maybeSingle()

  const planId = (store?.plan || 'free') as PlanId
  const planPrice = PLANS[planId]?.priceEur ?? 0

  if (code.kind === 'affiliate') {
    await grantCommission(attribution.id, code, planPrice)
  } else {
    await grantReferralReward(attribution.id, code, shop)
  }

  await supabase
    .from('growth_attributions')
    .update({ converted_at: new Date().toISOString() })
    .eq('id', attribution.id)
}

/**
 * AFFILIÉ : une commission en argent, versée à la main par l'admin.
 *
 * On ne fait qu'enregistrer la dette (`pending`) — aucun virement automatique.
 * L'admin la marque payée depuis son tableau de bord.
 */
async function grantCommission(
  attributionId: string,
  code: { id: string; owner_user_id: string | null; commission_percent: number | null },
  planPriceEur: number
): Promise<void> {
  const supabase = admin()

  const baseCents = Math.round(planPriceEur * 100)
  const percent = code.commission_percent ?? 0
  const amountCents = Math.round((baseCents * percent) / 100)

  if (amountCents <= 0) return

  const { error } = await supabase.from('growth_rewards').insert({
    attribution_id: attributionId,
    beneficiary_user_id: code.owner_user_id,
    beneficiary_role: 'referrer',
    reward_type: 'commission',
    base_amount_cents: baseCents,
    amount_cents: amountCents,
    currency: 'eur',
    status: 'pending',
  })

  // 23505 = doublon : le callback a déjà été traité. Ce n'est pas une erreur.
  if (error && error.code !== '23505') {
    console.error('[growth] commission non enregistrée:', error.message)
    return
  }

  if (!error && code.owner_user_id) {
    await notify(code.owner_user_id, 'Nouvelle commission', `Une commission de ${(amountCents / 100).toFixed(2)} € vous a été attribuée.`)
  }
}

/**
 * PARRAIN : un mois d'abonnement offert.
 *
 * Émis comme AVOIR Shopify → déduit automatiquement de sa prochaine facture,
 * sans qu'il ait quoi que ce soit à approuver.
 *
 * ⚠️ On réserve d'abord la récompense en base (`pending`), PUIS on émet l'avoir.
 * Dans l'autre sens, un échec d'écriture après un avoir émis offrirait un mois
 * sans trace — impossible à rattraper.
 */
async function grantReferralReward(
  attributionId: string,
  code: { id: string; owner_user_id: string | null; reward_months: number },
  shop: string
): Promise<void> {
  const supabase = admin()
  const referrerId = code.owner_user_id
  if (!referrerId) return

  const months = code.reward_months ?? 1
  if (months <= 0) return

  const usePartnerApi = isPartnerApiConfigured()

  // Réservation : c'est cette ligne qui rend l'opération idempotente.
  const { data: reward, error } = await supabase
    .from('growth_rewards')
    .insert({
      attribution_id: attributionId,
      beneficiary_user_id: referrerId,
      beneficiary_role: 'referrer',
      reward_type: usePartnerApi ? 'free_months' : 'ai_credits',
      months: usePartnerApi ? months : null,
      credits: usePartnerApi ? null : FALLBACK_AI_CREDITS * months,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code !== '23505') console.error('[growth] récompense non réservée:', error.message)
    return // doublon = déjà versée
  }

  // ── Repli : crédits IA (aucun jeton Partner API) ──────────────────────────
  if (!usePartnerApi) {
    const credits = FALLBACK_AI_CREDITS * months
    const { error: rpcErr } = await supabase.rpc('credit_ai_conversations', {
      p_user_id: referrerId,
      p_amount: credits,
    })

    if (rpcErr) {
      console.error('[growth] crédit IA échoué:', rpcErr.message)
      await supabase.from('growth_rewards').update({ status: 'void' }).eq('id', reward.id)
      return
    }

    await supabase
      .from('growth_rewards')
      .update({ status: 'granted', granted_at: new Date().toISOString() })
      .eq('id', reward.id)

    await notify(referrerId, 'Parrainage réussi', `${credits} conversations IA ont été ajoutées à votre compte.`)
    return
  }

  // ── Avoir Shopify : la vraie récompense ───────────────────────────────────
  //
  // Le montant est celui du plan du PARRAIN : on lui offre son mois, pas celui
  // du filleul.
  const { data: referrerStore } = await supabase
    .from('shopify_stores')
    .select('plan, shop_domain')
    .eq('user_id', referrerId)
    .eq('is_active', true)
    .maybeSingle()

  const referrerPlan = (referrerStore?.plan || 'starter') as PlanId
  const monthValue = PLANS[referrerPlan]?.priceEur ?? PLANS.starter.priceEur

  // La Partner API exige l'identifiant Shopify de la boutique du PARRAIN (pas du
  // filleul : c'est lui qu'on récompense). On le demande à Shopify plutôt que de
  // le stocker — une colonne de plus serait une colonne de plus à maintenir, et
  // elle serait vide pour toutes les boutiques déjà installées.
  const referrerShop = referrerStore?.shop_domain
  if (!referrerShop) {
    console.error('[growth] le parrain n’a pas de boutique active — avoir non émis')
    return // reste `pending` : rattrapable
  }

  const shopGid = await fetchShopGid(referrerShop)
  if (!shopGid) {
    console.error('[growth] identifiant de boutique introuvable — avoir non émis')
    // On garde la récompense en `pending` : elle pourra être émise plus tard.
    return
  }

  const credit = await createAppCredit({
    shopId: shopGid,
    amount: monthValue * months,
    currencyCode: 'EUR',
    description: `Xeyo — ${months} mois offert${months > 1 ? 's' : ''} (parrainage)`,
    // Un avoir réel sur un abonnement de test n'aurait aucun sens.
    test: isTestBilling(),
  })

  if (!credit.ok) {
    console.error('[growth] avoir non émis:', credit.error)
    return // reste `pending` : rattrapable
  }

  await supabase
    .from('growth_rewards')
    .update({
      status: 'granted',
      granted_at: new Date().toISOString(),
      shopify_credit_id: credit.creditId,
    })
    .eq('id', reward.id)

  await notify(
    referrerId,
    'Parrainage réussi 🎉',
    `${months} mois offert${months > 1 ? 's' : ''} : le montant sera déduit de votre prochaine facture Shopify.`
  )
}

/**
 * L'identifiant Shopify d'une boutique (gid://shopify/Shop/…), requis par la
 * Partner API pour émettre un avoir.
 *
 * On le demande à Shopify au moment voulu plutôt que de le stocker : c'est une
 * donnée stable, et une colonne de plus serait vide pour toutes les boutiques
 * déjà installées.
 */
async function fetchShopGid(shop: string): Promise<string | null> {
  try {
    const { getValidAccessToken } = await import('@/lib/shopify/token')
    const { shopifyGraphQL } = await import('@/lib/shopify/client')

    const token = await getValidAccessToken(shop)
    if (!token) return null

    const res = await shopifyGraphQL<{ shop: { id: string } }>(
      shop,
      token,
      `query { shop { id } }`
    )
    if (!res.ok) return null
    return res.data.shop?.id ?? null
  } catch (e) {
    console.error('[growth] identifiant de boutique illisible:', e)
    return null
  }
}

/** Alerte in-app. Best-effort : ne doit jamais faire échouer une récompense. */
async function notify(userId: string, title: string, message: string): Promise<void> {
  try {
    await admin().from('user_alerts').insert({
      user_id: userId,
      alert_type: 'info',
      title,
      message,
      metadata: { type: 'growth_reward' },
    })
  } catch (e) {
    console.error('[growth] alerte non créée (non bloquant):', e)
  }
}
