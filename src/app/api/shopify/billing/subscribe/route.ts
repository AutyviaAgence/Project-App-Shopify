import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, createAppSubscription, getShopifyConfig } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { PLANS, PAID_PLANS, type PlanId } from '@/lib/shopify/plans'
import { planPrice } from '@/lib/plans'

/**
 * Montant réellement facturé, déduit du NOM de l'abonnement Shopify.
 *
 * Format posé par cette route : « Xeyo <Plan> » ou « Xeyo <Plan> (Annuel) ».
 * On lit l'intervalle dans le nom : sans lui, un Pro ANNUEL (1430 € réglés
 * d'avance) serait évalué à 149 € et un passage au mensuel ne passerait pas
 * pour une baisse.
 *
 * ⚠️ Compat rename Growth → Pro : les abonnements antérieurs s'appellent
 * « Xeyo Growth » et ne contiennent plus le libellé « pro ».
 */
function priceFromSubscriptionName(name: string): number {
  const n = (name || '').toLowerCase()
  const annual = n.includes('annuel') || n.includes('annual')
  const plan: PlanId | undefined = n.includes('growth')
    ? 'pro'
    : (Object.keys(PLANS) as PlanId[]).find(
        (id) => id !== 'free' && n.includes(PLANS[id].name.toLowerCase())
      )
  return plan ? planPrice(plan, annual ? 'annual' : 'monthly') : 0
}

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

  const body = (await req.json().catch(() => ({}))) as {
    shop?: string
    plan?: PlanId
    promo_code?: string
    billing?: 'monthly' | 'annual'
    /** D'où part la demande, pour y ramener le marchand s'il annule. */
    origin?: 'embedded' | 'subscription' | 'onboarding'
  }
  // En embedded, la boutique vient du SESSION TOKEN (source sûre), pas du corps.
  const shop = authed.shop || body.shop
  const plan = body.plan
  const promoCode = (body.promo_code || '').trim()
  // Intervalle de facturation : mensuel (défaut) ou annuel (-20 %).
  const billing: 'monthly' | 'annual' = body.billing === 'annual' ? 'annual' : 'monthly'
  const isAnnual = billing === 'annual'

  // Page d'où part la demande — le callback y ramène le marchand s'il annule.
  //
  // ⚠️ LISTE BLANCHE, jamais une URL. Ce champ vient du navigateur : accepter un
  // chemin libre ouvrirait une redirection arbitraire depuis un lien signé par
  // Shopify. Une valeur inconnue retombe sur la vue embedded.
  const origin =
    body.origin === 'subscription' || body.origin === 'onboarding' ? body.origin : 'embedded'

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
    .select('id, access_token, plan, subscription_status, trial_used_at, billing_interval')
    .eq('shop_domain', shop)
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.access_token) {
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  }

  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux — le marchand ne pourrait pas
  // s'abonner sans comprendre pourquoi. Erreur explicite si la reconnexion s'impose.
  const token = await getValidAccessToken(shop)
  if (!token) {
    return NextResponse.json(
      { error: 'Jeton Shopify invalide — rouvrez l\'application depuis l\'admin Shopify pour la reconnecter, puis réessayez.' },
      { status: 502 }
    )
  }
  const planDef = PLANS[plan]
  const { appUrl } = getShopifyConfig()

  // Passe-t-il à un montant MOINS cher, alors qu'il a un abonnement en cours ?
  // (S'il n'a pas d'abonnement actif, il n'a rien payé : rien à préserver.)
  //
  // ⚠️ On compare les prix EFFECTIVEMENT FACTURÉS (plan × intervalle), pas le
  // prix mensuel de référence. Sinon un marchand en Pro ANNUEL (1430 € payés
  // d'avance) qui repasse Pro MENSUEL passait pour « pas une baisse » (149 vs 149)
  // et était basculé immédiatement — perdant l'année déjà réglée. En comparant
  // le montant réel (1430/an vs 149/mois), c'est bien détecté comme une baisse
  // et différé au prochain cycle.
  // ⚠️ LA RÉFÉRENCE EST SHOPIFY, PAS NOTRE BASE.
  //
  // On comparait au `plan` stocké. Si celui-ci est faux — une resynchro qui a
  // dérapé, une correction manuelle, un webhook manqué — la comparaison se fait
  // contre une valeur erronée : un Scale enregistré à tort en Pro passe pour
  // « Pro → Pro », donc PAS une baisse, et le marchand perd sur-le-champ le
  // Scale qu'il a payé. C'est exactement ce qui s'est produit en test.
  //
  // On demande donc à Shopify ce qu'il facture RÉELLEMENT, et on ne retombe sur
  // notre base que s'il ne répond pas.
  let currentPrice = 0
  let hasActiveSub = store.subscription_status === 'active'
  // ⚠️ CAPTURER LA FIN DE PÉRIODE **AVANT** DE CRÉER LE REMPLACEMENT.
  //
  // Shopify ne garde qu'UN SEUL abonnement actif : créer le nouveau annule
  // l'ancien, et son `currentPeriodEnd` devient alors `null`. La date jusqu'à
  // laquelle le marchand a PAYÉ est donc perdue à jamais si on ne la relève pas
  // maintenant — et c'est précisément cette date qui doit lui garantir l'accès
  // pendant toute la période réglée.
  let paidUntil: string | null = null
  try {
    const { listActiveSubscriptions } = await import('@/lib/shopify/client')
    const live = (await listActiveSubscriptions(shop, token)).filter((s) => s.status === 'ACTIVE')
    if (live.length > 0) {
      hasActiveSub = true
      currentPrice = Math.max(...live.map((s) => priceFromSubscriptionName(s.name)))
      // La plus lointaine : c'est jusque-là que l'accès est acquis.
      const ends = live.map((s) => s.currentPeriodEnd).filter(Boolean) as string[]
      if (ends.length > 0) {
        paidUntil = ends.sort().reverse()[0]
      }
    }
  } catch {
    // Shopify injoignable : on retombe sur la base, mieux que rien.
    currentPrice = 0
  }

  if (currentPrice === 0) {
    const currentPlan = (store.plan || 'free') as PlanId
    const currentInterval: 'monthly' | 'annual' =
      store.billing_interval === 'annual' ? 'annual' : 'monthly'
    currentPrice = currentPlan === 'free' ? 0 : planPrice(currentPlan, currentInterval)
  }

  const newPrice = planPrice(plan, billing)
  const isDowngrade = hasActiveSub && newPrice < currentPrice

  // Trace de la décision : sans elle, un différé qui ne s'applique pas est
  // indébogable — on ne sait pas si c'est le calcul ou Shopify qui a tranché.
  console.log('[billing/subscribe]', shop, {
    from: store.plan,
    to: plan,
    currentPrice,
    newPrice,
    hasActiveSub,
    isDowngrade,
    replacementBehavior: isDowngrade ? 'APPLY_ON_NEXT_BILLING_CYCLE' : 'APPLY_IMMEDIATELY',
  })

  // ── Code promo (optionnel) ────────────────────────────────────────────────
  // La table `promo_codes` existait mais n'était JAMAIS lue : cette route
  // attendait un code que personne ne lui envoyait. Elle le reçoit enfin.
  const { resolvePromoCode, isTestBilling } = await import('@/lib/shopify/billing')
  let promoId: string | null = null
  // Table d'origine du code : `promo_redemptions` a une FK stricte vers
  // `promo_codes`, donc le callback ne doit PAS y enregistrer un code growth.
  let promoSource: 'promo' | 'growth' = 'promo'
  let discount: { percentage?: number; amount?: number; durationLimitInIntervals?: number } | undefined
  // ESSAI 7 JOURS — UNE SEULE FOIS PAR BOUTIQUE.
  //
  // ⚠️ La Billing API (appSubscriptionCreate + trialDays) N'A PAS la protection
  // anti-abus des 180 jours de « Shopify App Pricing ». Sans garde-fou, un
  // marchand s'abonnerait → annulerait → se réabonnerait pour un nouvel essai,
  // en boucle. `trial_used_at` (posé au callback, paiement confirmé) garantit un
  // seul essai. NULL = jamais eu → essai accordé.
  const DEFAULT_TRIAL_DAYS = store.trial_used_at ? 0 : 7
  let trialDays = DEFAULT_TRIAL_DAYS

  if (promoCode) {
    const resolved = await resolvePromoCode(promoCode, authed.userId, plan)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    promoId = resolved.promo.id
    promoSource = resolved.promo.source
    if (resolved.promo.percentage != null || resolved.promo.amountCents != null) {
      discount = {
        percentage: resolved.promo.percentage,
        amount: resolved.promo.amountCents != null ? resolved.promo.amountCents / 100 : undefined,
        durationLimitInIntervals: resolved.promo.durationMonths,
      }
    }
    // Un code promo peut toujours offrir un essai (même après le 1ᵉʳ essai
    // consommé) : c'est un avantage explicite, pas un abus. On prend le max.
    trialDays = Math.max(DEFAULT_TRIAL_DAYS, resolved.promo.trialDays ?? 0)
  }

  // Le code promo voyage jusqu'au callback : c'est lui qui enregistrera son
  // utilisation, une fois le paiement CONFIRMÉ par Shopify (jamais avant).
  // ⚠️ `deferred=1` transmet LA DÉCISION, au lieu de la laisser recalculer au retour.
  //
  // Le callback comparait les prix à partir de l'état de la boutique au moment du
  // retour — mais cet état a déjà été modifié ici. Il comparait donc le nouveau plan
  // à lui-même, ne voyait aucune baisse, et l'appliquait IMMÉDIATEMENT : le marchand
  // passait de Scale à Growth sur-le-champ, alors que Shopify affichait pourtant
  // « remplace votre abonnement une fois le cycle de facturation terminé ».
  //
  // La décision est prise ici, une fois, et elle voyage avec le retour.
  const returnUrl =
    `${appUrl}/api/shopify/billing/callback?shop=${encodeURIComponent(shop)}&plan=${plan}` +
    `&interval=${billing}` +
    `&from=${origin}` +
    (promoId ? `&promo=${promoId}&promo_src=${promoSource}` : '') +
    (isDowngrade ? '&deferred=1' : '')

  const result = await createAppSubscription(shop, token, {
    // Le nom porte l'intervalle → le sync (qui déduit le plan depuis le nom)
    // reste lisible, et le marchand distingue mensuel/annuel sur son écran Shopify.
    name: `Xeyo ${planDef.name}${isAnnual ? ' (Annuel)' : ''}`,
    // Prix selon l'intervalle : annuel = mensuel×12 -20 %.
    price: planPrice(plan, billing),
    currencyCode: 'EUR',
    returnUrl,
    test: isTestBilling(),
    annual: isAnnual,
    trialDays: trialDays || undefined,
    discount,
    // ⚠️ MONTÉE = TOUT DE SUITE. BAISSE = AU PROCHAIN CYCLE.
    //
    // Tout était appliqué immédiatement. Conséquence : un marchand qui passait de
    // Scale à Starter perdait sur-le-champ ce qu'il avait DÉJÀ PAYÉ — il avait réglé
    // un mois complet au tarif supérieur et se retrouvait aussitôt bridé.
    //
    //  · Montée en gamme → `APPLY_IMMEDIATELY` : il veut son accès maintenant, et
    //    Shopify lui crédite au prorata ce qu'il a déjà versé.
    //  · Baisse de gamme → `APPLY_ON_NEXT_BILLING_CYCLE` : il garde son plan actuel
    //    jusqu'au bout de la période qu'il a payée, puis bascule.
    //
    // Un réabonnement après annulation est traité comme une montée (il n'a plus rien).
    replacementBehavior: isDowngrade ? 'APPLY_ON_NEXT_BILLING_CYCLE' : 'APPLY_IMMEDIATELY',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  const sub = result.data.appSubscriptionCreate
  if (sub.userErrors.length > 0 || !sub.confirmationUrl) {
    return NextResponse.json({ error: sub.userErrors[0]?.message || 'Erreur Billing Shopify' }, { status: 502 })
  }

  // ⚠️ `pending_plan`, PAS `plan`.
  //
  // Cette route écrivait `plan = <le plan payant visé>` avec
  // `subscription_status = 'pending'`. Or le contrôle de quota retombe en GRATUIT
  // dès que le statut n'est pas `active`. Conséquence, constatée en production
  // (plan='pro', status='pending') : un marchand qui lance un abonnement — ou un
  // changement de plan — et n'approuve pas immédiatement se retrouve bridé en
  // gratuit, alors qu'il a peut-être déjà un abonnement payant en cours.
  //
  // Le plan visé attend donc ici, et `plan` ne change qu'au callback, une fois le
  // paiement confirmé par Shopify.
  //
  // ⚠️ SUR UNE BAISSE DE PLAN, ON NE TOUCHE PAS AU STATUT.
  //
  // Le marchand garde son plan actuel jusqu'à la fin de la période qu'il a payée.
  // Passer le statut à `pending` le ferait retomber en GRATUIT sur-le-champ — il
  // perdrait immédiatement l'accès qu'il a déjà réglé, alors qu'il a simplement
  // demandé à payer moins cher le mois prochain.
  await admin
    .from('shopify_stores')
    .update({
      pending_plan: plan,
      ...(isDowngrade ? {} : { subscription_status: 'pending' }),
      // Sur une BAISSE, on grave la date jusqu'à laquelle l'ancien plan est
      // payé : Shopify va l'effacer en annulant l'abonnement, et c'est notre
      // seule preuve que le marchand a droit au plan supérieur jusque-là.
      ...(isDowngrade && paidUntil ? { current_period_end: paidUntil } : {}),
      shopify_charge_id: sub.appSubscription?.id ?? null,
      billing_source: 'shopify',
      billing_interval: billing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  return NextResponse.json({
    data: {
      confirmationUrl: sub.confirmationUrl,
      /** Le front s'en sert pour dire « à partir du prochain renouvellement ». */
      effectiveAt: isDowngrade ? 'next_cycle' : 'immediate',
    },
  })
}
