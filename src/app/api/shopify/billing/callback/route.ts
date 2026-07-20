import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain, getShopifyConfig, getAppSubscriptionStatus } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { PLANS, type PlanId } from '@/lib/shopify/plans'

/**
 * GET /api/shopify/billing/callback?shop=…&plan=…
 * Retour de l'écran de facturation Shopify (Billing API).
 *
 * ⚠️ `appSubscriptionCreate` ne prend QU'UNE URL de retour : Shopify y renvoie
 * le marchand qu'il approuve OU qu'il annule. Il n'existe pas d'URL
 * d'annulation distincte — c'est à nous de distinguer les deux cas.
 *
 * ⚠️ SÉCURITÉ : ne JAMAIS faire confiance aux query params seuls. On vérifie
 * auprès de Shopify que l'abonnement (charge_id stocké au subscribe) est bien
 * ACTIVE avant d'activer le plan — sinon n'importe qui pourrait forger ce
 * callback (?shop=X&plan=scale) et débloquer un plan payant sans payer.
 */

/**
 * L'app vue depuis l'admin Shopify du marchand.
 *
 * ⚠️ Le nom de boutique est DÉRIVÉ de `shop`, jamais écrit en dur : coder
 * `/store/xeyo-dev/` enverrait tous les marchands dans NOTRE boutique de dev.
 * Le handle, lui, appartient à l'app et ne change pas d'un marchand à l'autre.
 */
function adminAppUrl(shop: string) {
  const storeName = shop.replace(/\.myshopify\.com$/i, '')
  const handle = process.env.SHOPIFY_APP_HANDLE || 'xeyo-whatsapp-support-chat-1'
  return `https://admin.shopify.com/store/${storeName}/apps/${handle}/shopify`
}

/**
 * Ramène le marchand LÀ D'OÙ IL VIENT, plutôt que sur une page d'erreur nue.
 *
 * `from` est posé par /subscribe depuis une liste blanche — jamais une URL
 * libre, sinon ce lien signé par Shopify deviendrait une redirection ouverte.
 */
function backToApp(req: NextRequest, shop: string, reason: string) {
  const { appUrl } = getShopifyConfig()
  const from = req.nextUrl.searchParams.get('from')

  // Depuis la vue embedded, on renvoie vers l'app DANS l'admin Shopify — pas
  // vers app.xeyo.io en direct. Sans ça, le marchand qui annule sort de son
  // admin et se retrouve sur une page nue, hors du cadre Shopify.
  if (from !== 'subscription' && from !== 'onboarding') {
    return NextResponse.redirect(`${adminAppUrl(shop)}?billing=${reason}`)
  }

  const path = from === 'subscription' ? '/settings?tab=abonnement' : '/onboarding'
  const sep = path.includes('?') ? '&' : '?'
  return NextResponse.redirect(`${appUrl}${path}${sep}billing=${reason}`)
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop')
  const plan = req.nextUrl.searchParams.get('plan') as PlanId | null

  // Domaine invalide : on ne peut même pas construire un retour fiable.
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
    .select('id, user_id, access_token, shopify_charge_id, pending_plan, plan, subscription_status, trial_used_at')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.access_token || !store.shopify_charge_id) {
    return backToApp(req, shop, 'none')
  }

  // VÉRIFICATION auprès de Shopify : l'abonnement doit être ACTIVE.
  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux — ici le plan payé ne serait JAMAIS
  // activé. getValidAccessToken le rafraîchit ; si null, on remonte une erreur
  // explicite au marchand plutôt que d'échouer en silence.
  const token = await getValidAccessToken(shop)
  if (!token) {
    return backToApp(req, shop, 'reconnect')
  }
  const sub = await getAppSubscriptionStatus(shop, token, store.shopify_charge_id)
  if (!sub || sub.status !== 'ACTIVE') {
    // ── ANNULATION : on revient simplement en arrière ────────────────────────
    //
    // C'est le chemin du bouton « Annuler » (l'abonnement reste DECLINED, ou
    // n'existe pas). Ce n'est PAS une erreur : le marchand a changé d'avis.
    //
    // On efface l'attente laissée par /subscribe, sinon l'app continuerait
    // d'annoncer un changement de plan « en cours » qui n'arrivera jamais, et
    // le prochain essai comparerait au mauvais plan de référence.
    //
    // `plan` et `subscription_status` ne sont PAS touchés : /subscribe ne les
    // modifie pas non plus (il n'écrit que `pending_plan`), donc un marchand
    // déjà abonné qui renonce à changer de formule garde exactement la sienne.
    //
    // ⚠️ NE PAS effacer `shopify_charge_id` ici. /subscribe l'a écrasé avec le
    // NOUVEAU abonnement (celui qui vient d'être refusé), mais /billing/cancel
    // s'en sert comme unique référence pour résilier : le vider laisserait un
    // marchand déjà abonné sans aucun moyen d'annuler sa formule en cours.
    // Le prochain /subscribe le réécrira de toute façon.
    await admin
      .from('shopify_stores')
      .update({ pending_plan: null, updated_at: new Date().toISOString() })
      .eq('id', store.id)

    return backToApp(req, shop, 'cancelled')
  }

  // La VRAIE date de fin de période, demandée à Shopify.
  //
  // Elle était calculée en `+30 jours` en dur. C'est faux dès qu'il y a une
  // période d'essai (code promo, récompense de parrainage) : le marchand serait
  // considéré comme expiré alors que son abonnement court toujours.
  const { listActiveSubscriptions } = await import('@/lib/shopify/client')
  const active = await listActiveSubscriptions(shop, token)
  const current = active.find((s) => s.id === store.shopify_charge_id)

  const periodEnd = current?.currentPeriodEnd
    ? new Date(current.currentPeriodEnd)
    : (() => {
        const d = new Date()
        d.setDate(d.getDate() + 30)
        return d
      })()

  // Le plan à activer est celui qui ATTENDAIT l'approbation. On retombe sur le
  // paramètre d'URL uniquement pour les abonnements créés avant ce correctif.
  const activatedPlan = store.pending_plan || plan

  // ⚠️ BAISSE DE PLAN : elle ne prend effet qu'au PROCHAIN CYCLE.
  //
  // Shopify a approuvé le nouvel abonnement avec `APPLY_ON_NEXT_BILLING_CYCLE` :
  // l'ancien continue de courir jusqu'à la fin de la période déjà payée (son écran
  // l'annonce d'ailleurs — « remplace votre abonnement une fois le cycle de
  // facturation terminé »). Appliquer le plan inférieur maintenant briderait le
  // marchand alors qu'il a réglé le tarif supérieur pour tout le mois.
  //
  // ⚠️ La décision vient de `subscribe`, elle n'est PAS recalculée ici.
  //
  // On la recalculait en comparant les prix à partir de l'état de la boutique — mais
  // `subscribe` a déjà modifié cet état avant la redirection. Le callback comparait
  // donc le nouveau plan à lui-même, ne voyait aucune baisse, et l'appliquait
  // IMMÉDIATEMENT. C'est ce qu'on observait : Scale → Growth appliqué sur-le-champ.
  //
  // Ce paramètre est manipulable, mais le risque est nul : le forcer ne peut que
  // RETARDER un changement, jamais accorder un plan supérieur sans le payer.
  const isDeferredDowngrade = req.nextUrl.searchParams.get('deferred') === '1'

  // Intervalle de facturation : transmis par /subscribe (déjà écrit en base au
  // moment du subscribe). On le relit du query param, mais on ne l'accepte que
  // s'il est valide — sinon on ne touche pas à la colonne existante.
  const intervalParam = req.nextUrl.searchParams.get('interval')
  const billingInterval =
    intervalParam === 'annual' || intervalParam === 'monthly' ? intervalParam : null

  await admin
    .from('shopify_stores')
    .update({
      plan: isDeferredDowngrade ? store.plan : activatedPlan,
      pending_plan: isDeferredDowngrade ? activatedPlan : null,
      subscription_status: 'active',
      billing_source: 'shopify',
      ...(billingInterval ? { billing_interval: billingInterval } : {}),
      // ESSAI CONSOMMÉ : à la PREMIÈRE activation, on grave `trial_used_at`. Tout
      // réabonnement ultérieur n'aura plus d'essai (subscribe le lit). On ne
      // l'écrase jamais s'il existe déjà (préserve la date du 1ᵉʳ essai, et
      // survit à une désinstallation/réinstallation puisque la ligne est gardée).
      ...(store.trial_used_at ? {} : { trial_used_at: new Date().toISOString() }),
      current_period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  // ── Code promo : on ne l'enregistre qu'ICI ────────────────────────────────
  // Le paiement vient d'être CONFIRMÉ par Shopify. Enregistrer l'utilisation
  // plus tôt permettrait de « brûler » un code sans jamais payer.
  const promoId = req.nextUrl.searchParams.get('promo')
  // ⚠️ Un code d'AFFILIATION ne s'enregistre pas ici : `promo_redemptions` a une
  // clé étrangère stricte vers `promo_codes`, l'insert échouerait. Son suivi
  // passe par `growth_attributions`, posé à l'inscription du marchand.
  const isGrowthCode = req.nextUrl.searchParams.get('promo_src') === 'growth'
  if (promoId && store.user_id && !isGrowthCode) {
    try {
      const { redeemPromoCode } = await import('@/lib/shopify/billing')
      await redeemPromoCode(promoId, store.user_id, store.shopify_charge_id)
    } catch (e) {
      // Ne doit jamais empêcher l'activation d'un plan déjà payé.
      console.error('[billing/callback] enregistrement du code promo échoué (non bloquant):', e)
    }
  }

  // ── Code d'AFFILIATION saisi à la souscription ────────────────────────────
  //
  // ⚠️ LE MAILLON QUI MANQUAIT.
  //
  // L'attribution n'était posée qu'à l'INSCRIPTION, depuis le cookie du lien
  // `/r/<code>`. Un marchand déjà inscrit qui saisissait le code de son
  // partenaire dans le champ obtenait bien la remise… mais aucune attribution
  // n'existait, donc `settleAttribution` (juste en dessous) ne trouvait rien et
  // le partenaire ne touchait JAMAIS sa commission.
  //
  // On la pose donc ici, le paiement étant confirmé. `referee_id` est UNIQUE :
  // un marchand déjà attribué (via le lien) le reste — l'insert est ignoré,
  // ce qui interdit aussi de changer de parrain après coup.
  if (promoId && store.user_id && isGrowthCode) {
    try {
      const { data: code } = await admin
        .from('growth_codes')
        .select('id, owner_user_id, is_active')
        .eq('id', promoId)
        .maybeSingle()

      // Anti auto-parrainage : on ne touche pas de commission sur soi-même.
      if (code?.is_active && code.owner_user_id !== store.user_id) {
        await admin
          .from('growth_attributions')
          .insert({ code_id: code.id, referee_id: store.user_id })
      }
    } catch (e) {
      // Un doublon est le cas NORMAL (déjà attribué via le lien) — jamais bloquant.
      console.error('[billing/callback] attribution du code affilié ignorée:', e)
    }
  }

  // ── Parrainage / affiliation ──────────────────────────────────────────────
  //
  // ⚠️ PAS DE RÉCOMPENSE PENDANT L'ESSAI GRATUIT.
  //
  // Shopify passe l'abonnement en `ACTIVE` dès l'approbation — essai compris,
  // donc AVANT le moindre paiement. Verser sur ce seul statut était exploitable :
  // approuver un essai de 7 jours, encaisser la récompense (un avoir Shopify, qui
  // n'est PAS révocable), puis annuler avant la fin. Coût pour le fraudeur : 0 €.
  //
  // On attend donc un cycle réellement facturé. C'est le webhook
  // `app_subscriptions/update` qui rattrapera le versement à la fin de l'essai
  // (l'abonnement y repasse ACTIVE hors trial). Idempotent : contrainte d'unicité
  // en base, un rejeu ne verse pas deux fois.
  const { isWithinTrial } = await import('@/lib/shopify/client')
  if (store.user_id && !isWithinTrial(sub)) {
    try {
      const { settleAttribution } = await import('@/lib/growth/engine')
      await settleAttribution(store.user_id, shop)
    } catch (e) {
      console.error('[billing/callback] attribution échouée (non bloquant):', e)
    }
  } else if (store.user_id) {
    console.log('[billing/callback] récompense différée : essai en cours pour', shop)
  }

  // Succès : même logique de retour — le marchand revient là où il a cliqué.
  return backToApp(req, shop, 'ok')
}
