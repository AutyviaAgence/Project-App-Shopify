'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { authenticatedFetch } from '@/lib/shopify/authenticated-fetch'

/**
 * Page EMBEDDED (admin Shopify) — refonte App Bridge.
 *
 * Requirements couverts :
 *  · 1.1.1  session tokens (authenticatedFetch, plus aucun cookie ni échappement
 *           d'iframe).
 *  · 2.2.2  l'app est UTILISABLE dans l'admin : le marchand y voit ses contacts et
 *           ses conversations, et peut y changer/annuler son abonnement.
 *  · 5.1.5  les données clients collectées via le storefront (opt-ins, contacts,
 *           conversations) sont RESTITUÉES au marchand dans l'admin Shopify.
 */

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

type Status = {
  installed: boolean
  shop_name?: string | null
  plan?: string | null
  agent?: { name?: string | null } | null
  documents?: number | null
  whatsapp_connected?: boolean
  approved_templates?: number | null
}

type Conversation = {
  id: string
  name: string
  phone: string | null
  optedIn: boolean
  lastMessageAt: string | null
  preview: string
  unread: number
}

type Overview = {
  /** Email du compte Xeyo propriétaire de la boutique (identité = boutique, pas personne). */
  linkedAccountEmail?: string | null
  plan: string
  subscriptionStatus: string | null
  shopDomain: string | null
  /** Fin de la période payée. Le marchand garde son plan jusque-là, même après annulation. */
  periodEnd?: string | null
  /** Plan qui prendra effet au prochain renouvellement (baisse de plan, annulation). */
  pendingPlan?: string | null
  /** Intervalle réellement facturé : mensuel ou annuel (-20 %). */
  billingInterval?: 'monthly' | 'annual'
  /** Crédits IA : quota du plan (mensuel) et recharges (ne périment pas). */
  credits?: {
    used: number
    planLimit: number | null
    planUsed: number
    extra: number
    extraRemaining: number
    unlimited: boolean
  } | null
  contactsCount: number
  optedInCount: number
  conversations: Conversation[]
  /** `profiles.onboarding_completed_at` renseigné côté Xeyo. */
  onboardingDone?: boolean
}

/**
 * État de la liaison boutique ↔ compte Xeyo.
 *
 * Servi par `/api/shopify/embedded/link-account`, la SEULE route embedded qui
 * n'exige pas un compte Xeyo (session token suffisant) — donc la seule qui répond
 * encore quand la boutique est déliée (`user_id = NULL`).
 */
type LinkState = {
  installed: boolean
  linked: boolean
  shopName: string | null
  /** L'email de la PERSONNE connectée à l'admin Shopify (pas celui de la boutique). */
  staffEmail: string | null
  staffName: string | null
  /** Shopify a vérifié son email et ce n'est pas un collaborateur → création possible. */
  canCreate: boolean
  /** Un compte Xeyo porte déjà cet email → « c'est bien moi » plutôt que « créer ». */
  hasAccount: boolean
  isCollaborator: boolean
}

/**
 * ⚠️ Doit correspondre EXACTEMENT à ce que la Billing API prélève
 * (`createAppSubscription` → `currencyCode`, actuellement 'EUR').
 *
 * Un écart entre le prix AFFICHÉ et le prix PRÉLEVÉ est un motif de rejet à la
 * review : le marchand doit savoir ce qu'il paie. Si la devise change côté
 * facturation, elle doit changer ici aussi.
 */
const PLAN_CURRENCY = '€'

// Plus de plan Gratuit : l'app est 100 % payante (7 jours d'essai). L'annulation
// se fait via un bouton dédié (plus par une « carte Gratuit »).
const PLANS = [
  { id: 'starter', name: 'Starter', price: 49, aiConv: 550 },
  { id: 'pro', name: 'Pro', price: 149, aiConv: 1800 },
  { id: 'scale', name: 'Scale', price: 349, aiConv: 4500 },
]

/**
 * Dictionnaire LOCAL (FR/EN).
 *
 * ⚠️ Volontairement PAS le provider `@/i18n/context` : cette page vit hors de
 * l'arbre React du provider (vue embedded Shopify). S'y brancher risquerait de
 * casser le chargement dans l'iframe.
 *
 * L'anglais est la langue PAR DÉFAUT : Shopify est majoritairement anglophone et
 * la review de l'App Store se fait en anglais. Le français n'est servi que si la
 * locale transmise par Shopify commence par `fr`.
 */
const STRINGS = {
  fr: {
    // ── Locale de formatage (dates, nombres) ──
    locale: 'fr-FR',

    // ── Retour de l'écran de facturation Shopify ──
    // Shopify renvoie sur la même URL qu'on approuve ou qu'on annule : ces
    // messages disent au marchand ce qui vient de se passer.
    billingOk: 'Abonnement activé, merci ! Vous pouvez ouvrir l’application.',
    billingCancelled: 'Abonnement non validé. Vous pouvez réessayer quand vous le souhaitez.',
    billingNone: 'Aucun abonnement en attente pour cette boutique.',
    billingReconnect: 'Connexion à Shopify expirée. Rouvrez l’application depuis votre admin Shopify, puis réessayez.',
    dismiss: 'Fermer',

    // ── En-tête ──
    appTitle: 'Xeyo, WhatsApp Support & Chat',
    opening: 'Ouverture…',
    openApp: 'Ouvrir l’application →',
    loading: 'Chargement…',

    // ── Erreurs / messages système ──
    errGeneric: 'Erreur',
    errPurchase: 'Achat impossible',
    errBilling: 'Erreur de facturation',
    errLink: 'Liaison impossible',
    errOpen: 'Ouverture impossible',

    // ── Confirmations ──
    confirmCancelUntil: (until: string) =>
      `Annuler votre abonnement ?\n\nVous conservez votre accès jusqu'au ${until}, puis votre abonnement prendra fin. Aucun remboursement au prorata.`,
    confirmCancel:
      'Annuler votre abonnement ?\n\nVous conservez votre accès jusqu\'à la fin de la période déjà payée, puis votre abonnement prendra fin.',
    confirmUnlink:
      'Délier cette boutique de son compte Xeyo ?\n\n' +
      'Vos contacts et conversations restent attachés au compte actuel. ' +
      'Vous pourrez ensuite relier la boutique au compte de votre choix.',

    // ── Écran d'accueil / liaison ──
    welcomeTitle: 'Bienvenue sur Xeyo',
    welcomeSubtitle: 'Votre agent IA WhatsApp pour le support et les ventes.',
    featureAutoTitle: 'Réponses automatiques',
    featureAutoDesc: 'Un agent IA répond à vos clients 24h/24, avec vos vraies données produits.',
    featureCartTitle: 'Paniers abandonnés',
    featureCartDesc: 'Relancez sur WhatsApp, là où les messages sont vraiment lus.',
    featureOrderTitle: 'Suivi de commande',
    featureOrderDesc: 'Confirmation, expédition, livraison : tout est envoyé automatiquement.',
    linkTitle: 'Reliez votre compte',
    linkDesc:
      'Cette boutique n’est reliée à aucun compte Xeyo. Reliez-la pour accéder à vos contacts, votre agent IA et vos conversations.',
    linking: 'Liaison…',
    continueAs: (email: string) => `Continuer en tant que ${email}`,
    createAccountAs: (email: string) => `Créer mon compte (${email})`,
    haveAccount: 'J’ai déjà un compte Xeyo →',
    collaboratorNote:
      'Vous êtes collaborateur sur cette boutique. Reliez votre propre compte Xeyo, ou demandez au propriétaire de créer le compte.',
    linkHint:
      '« J’ai déjà un compte » ouvre app.xeyo.io : connectez-vous au compte de votre choix, la boutique y sera rattachée.',

    // ── Non installé ──
    notInstalledTitle: 'Installation requise',
    notInstalledDesc:
      'Cette boutique n’est pas encore reliée à Xeyo. Réinstallez l’application depuis l’App Store.',

    // ── Onboarding ──
    setupTitle: 'Terminez votre configuration',
    setupDesc:
      'Connectez WhatsApp, configurez votre agent IA et validez vos modèles de messages pour activer Xeyo sur votre boutique.',
    setupCta: 'Continuer la configuration →',

    // ── Contacts ──
    contactsTitle: 'Vos contacts WhatsApp',
    contactsDesc: 'Collectés depuis votre boutique (popup, checkout, page de remerciement).',
    contactsLabel: 'Contacts',
    optedInLabel: 'Abonnés WhatsApp (opt-in)',

    // ── Conversations ──
    conversationsTitle: 'Conversations récentes',
    seeAll: 'Tout voir →',
    noConversations: 'Aucune conversation pour l’instant.',
    optInBadge: 'opt-in',

    // ── Crédits IA ──
    creditsTitle: 'Conversations IA',
    creditsDesc: 'Une conversation où votre agent a répondu au moins une fois.',
    topUp: `Recharger · 500 conv. (45 ${PLAN_CURRENCY})`,
    creditsThisMonth: 'conversations ce mois-ci ·',
    unlimited: 'illimité',
    remaining: 'restantes',
    outOfIncluded: (total: string) => ` sur ${total} incluses`,
    resetsNextRenewal: 'Remis à zéro au prochain renouvellement',
    extraInReserve: 'de recharge en réserve ·',
    neverExpire: 'ne périment pas',

    // ── Abonnement ──
    subscriptionTitle: 'Abonnement',
    subscriptionDesc: 'Facturé avec votre facture Shopify. Changez ou annulez à tout moment.',
    planBadge: (plan: string) => `Plan ${plan}`,
    cancelledLabel: 'Abonnement annulé.',
    scheduledLabel: 'Changement programmé.',
    youKeepPlan: 'Vous gardez le plan',
    untilDate: (date: string) => ` jusqu'au ${date}`,
    untilPeriodEnd: ' jusqu’à la fin de la période payée',
    thenSubscriptionEnds: ', puis votre abonnement prendra fin.',
    thenYouSwitchTo: ', puis vous passerez au plan',
    // Suffixe qui suit le nom du plan (« … au plan Pro. » / « … to the Pro plan. »)
    planSuffix: '.',
    monthly: 'Mensuel',
    annual: 'Annuel',
    annualDiscount: '−20%',
    planDesc: (n: string) => `${n} conversations IA / mois`,
    perYear: (amount: string) => `${amount} ${PLAN_CURRENCY}/an`,
    perMonth: (amount: string) => `${amount} ${PLAN_CURRENCY}/mois`,
    annualEquivalent: (amount: string) => `soit ${amount} ${PLAN_CURRENCY}/mois · 2 mois offerts`,
    currentPlan: 'Plan actuel',
    switchToAnnual: 'Passer à l’annuel',
    switchToMonthly: 'Passer au mensuel',
    switchPlan: 'Changer',
    choosePlan: 'Choisir',
    promoPlaceholder: 'Code promo',
    promoHint: 'La remise s’affichera sur l’écran Shopify avant validation.',
    promoToggle: 'J’ai un code promo',
    billingNote:
      'Shopify vous demandera de confirmer. Aucun moyen de paiement à saisir : le montant s’ajoute à votre facture Shopify.',
    cancelling: 'Annulation…',
    cancelSubscription: 'Annuler mon abonnement',

    // ── Configuration ──
    configTitle: 'Configuration',
    stepWhatsapp: 'WhatsApp connecté',
    stepAgent: 'Agent IA configuré',
    stepTemplates: 'Modèles approuvés',

    // ── Compte relié ──
    accountTitle: 'Compte Xeyo relié',
    unlinkedNoticeBefore: 'Cette boutique n’est plus reliée à aucun compte Xeyo. Connectez-vous sur',
    unlinkedNoticeAfter:
      'avec le compte souhaité, puis cliquez sur « Relier à mon compte » depuis le tableau de bord.',
    linkedTo: 'Boutique reliée au compte Xeyo',
    teamNote: 'Tous les membres de votre équipe Shopify voient les mêmes données.',
    unlinking: 'Déliaison…',
    unlinkStore: 'Délier ma boutique',
  },
  en: {
    // ── Locale de formatage (dates, nombres) ──
    locale: 'en-US',

    // ── Return from the Shopify billing screen ──
    billingOk: 'Subscription activated, thank you! You can now open the app.',
    billingCancelled: 'Subscription not confirmed. You can try again whenever you like.',
    billingNone: 'No pending subscription for this store.',
    billingReconnect: 'Your Shopify connection expired. Reopen the app from your Shopify admin, then try again.',
    dismiss: 'Dismiss',

    // ── En-tête ──
    appTitle: 'Xeyo, WhatsApp Support & Chat',
    opening: 'Opening…',
    openApp: 'Open app →',
    loading: 'Loading…',

    // ── Erreurs / messages système ──
    errGeneric: 'Something went wrong',
    errPurchase: 'Purchase failed',
    errBilling: 'Billing error',
    errLink: 'Could not link your account',
    errOpen: 'Could not open the app',

    // ── Confirmations ──
    confirmCancelUntil: (until: string) =>
      `Cancel your subscription?\n\nYou keep access until ${until}, then your subscription ends. No prorated refund.`,
    confirmCancel:
      'Cancel your subscription?\n\nYou keep access until the end of the period you already paid for, then your subscription ends.',
    confirmUnlink:
      'Disconnect this store from its Xeyo account?\n\n' +
      'Your contacts and conversations stay with the current account. ' +
      'You can then connect the store to any account you choose.',

    // ── Écran d'accueil / liaison ──
    welcomeTitle: 'Welcome to Xeyo',
    welcomeSubtitle: 'Your WhatsApp AI agent for support and sales.',
    featureAutoTitle: 'Automated replies',
    featureAutoDesc: 'An AI agent answers your customers 24/7, using your real product data.',
    featureCartTitle: 'Abandoned carts',
    featureCartDesc: 'Follow up on WhatsApp, where messages actually get read.',
    featureOrderTitle: 'Order tracking',
    featureOrderDesc: 'Confirmation, shipping, delivery: everything is sent automatically.',
    linkTitle: 'Connect your account',
    linkDesc:
      'This store isn’t connected to a Xeyo account yet. Connect it to access your contacts, your AI agent and your conversations.',
    linking: 'Connecting…',
    continueAs: (email: string) => `Continue as ${email}`,
    createAccountAs: (email: string) => `Create my account (${email})`,
    haveAccount: 'I already have a Xeyo account →',
    collaboratorNote:
      'You’re a collaborator on this store. Connect your own Xeyo account, or ask the store owner to create one.',
    linkHint:
      '“I already have an account” opens app.xeyo.io: sign in with any account you like, and the store will be connected to it.',

    // ── Non installé ──
    notInstalledTitle: 'Installation required',
    notInstalledDesc:
      'This store isn’t connected to Xeyo yet. Reinstall the app from the App Store.',

    // ── Onboarding ──
    setupTitle: 'Finish your setup',
    setupDesc:
      'Connect WhatsApp, configure your AI agent and get your message templates approved to activate Xeyo on your store.',
    setupCta: 'Continue setup →',

    // ── Contacts ──
    contactsTitle: 'Your WhatsApp contacts',
    contactsDesc: 'Collected from your store (popup, checkout, thank-you page).',
    contactsLabel: 'Contacts',
    optedInLabel: 'WhatsApp subscribers (opt-in)',

    // ── Conversations ──
    conversationsTitle: 'Recent conversations',
    seeAll: 'View all →',
    noConversations: 'No conversations yet.',
    optInBadge: 'opt-in',

    // ── Crédits IA ──
    creditsTitle: 'AI conversations',
    creditsDesc: 'A conversation where your agent replied at least once.',
    topUp: `Top up · 500 conv. (${PLAN_CURRENCY}45)`,
    creditsThisMonth: 'conversations this month ·',
    unlimited: 'unlimited',
    remaining: 'remaining',
    outOfIncluded: (total: string) => ` of ${total} included`,
    resetsNextRenewal: 'Resets on your next renewal',
    extraInReserve: 'top-up conversations in reserve ·',
    neverExpire: 'never expire',

    // ── Abonnement ──
    subscriptionTitle: 'Subscription',
    subscriptionDesc: 'Billed on your Shopify invoice. Switch or cancel anytime.',
    planBadge: (plan: string) => `${plan} plan`,
    cancelledLabel: 'Subscription cancelled.',
    scheduledLabel: 'Change scheduled.',
    youKeepPlan: 'You keep the',
    untilDate: (date: string) => ` plan until ${date}`,
    untilPeriodEnd: ' plan until the end of the paid period',
    thenSubscriptionEnds: ', then your subscription ends.',
    thenYouSwitchTo: ', then you’ll move to the',
    // Suffixe qui suit le nom du plan (« … au plan Pro. » / « … to the Pro plan. »)
    planSuffix: ' plan.',
    monthly: 'Monthly',
    annual: 'Annual',
    annualDiscount: '−20%',
    planDesc: (n: string) => `${n} AI conversations / month`,
    perYear: (amount: string) => `${PLAN_CURRENCY}${amount}/yr`,
    perMonth: (amount: string) => `${PLAN_CURRENCY}${amount}/mo`,
    annualEquivalent: (amount: string) => `that’s ${PLAN_CURRENCY}${amount}/mo · 2 months free`,
    currentPlan: 'Current plan',
    switchToAnnual: 'Switch to annual',
    switchToMonthly: 'Switch to monthly',
    switchPlan: 'Switch',
    choosePlan: 'Choose',
    promoPlaceholder: 'Promo code',
    promoHint: 'The discount will appear on the Shopify screen before you confirm.',
    promoToggle: 'I have a promo code',
    billingNote:
      'Shopify will ask you to confirm. No payment details needed: the amount is added to your Shopify invoice.',
    cancelling: 'Cancelling…',
    cancelSubscription: 'Cancel subscription',

    // ── Configuration ──
    configTitle: 'Setup',
    stepWhatsapp: 'WhatsApp connected',
    stepAgent: 'AI agent configured',
    stepTemplates: 'Templates approved',

    // ── Compte relié ──
    accountTitle: 'Connected Xeyo account',
    unlinkedNoticeBefore: 'This store is no longer connected to a Xeyo account. Sign in at',
    unlinkedNoticeAfter:
      'with the account you want, then click “Connect to my account” from the dashboard.',
    linkedTo: 'Store connected to the Xeyo account',
    teamNote: 'Everyone on your Shopify staff sees the same data.',
    unlinking: 'Disconnecting…',
    unlinkStore: 'Disconnect my store',
  },
} as const

export default function ShopifyEmbeddedClient() {
  const searchParams = useSearchParams()
  const shop = searchParams.get('shop') || ''
  // Shopify transmet la locale du marchand dans l'URL de l'app embedded
  // (`?locale=en`, `?locale=fr-FR`…). Anglais par défaut : c'est la langue de la
  // majorité des marchands ET celle de la review App Store.
  const localeParam = searchParams.get('locale') || ''
  const lang: 'fr' | 'en' = localeParam.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const t = STRINGS[lang]
  const [status, setStatus] = useState<Status | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [linkState, setLinkState] = useState<LinkState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Résultat du passage par l'écran de facturation Shopify. `subscribed=1` est
  // conservé pour les liens déjà en circulation ; `billing=…` porte les autres cas.
  const billingParam = searchParams.get('subscribed') === '1' ? 'ok' : searchParams.get('billing')
  const [billingNoticeOpen, setBillingNoticeOpen] = useState(true)
  const billingNotice =
    billingParam === 'ok' ? { text: t.billingOk, ok: true }
    : billingParam === 'cancelled' ? { text: t.billingCancelled, ok: false }
    : billingParam === 'none' ? { text: t.billingNone, ok: false }
    : billingParam === 'reconnect' ? { text: t.billingReconnect, ok: false }
    : null
  // ⚠️ Le code promo était accepté par le serveur (la remise Shopify est bien
  // appliquée), mais AUCUNE interface ne permettait de le saisir. L'admin pouvait
  // créer des codes que personne ne pouvait utiliser.
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  // Intervalle choisi dans le sélecteur. Aligné sur l'abonnement en cours dès que
  // l'aperçu est chargé : un marchand déjà en annuel ne doit pas voir « Mensuel »
  // présélectionné (il croirait devoir rebasculer).
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly')
  const [buyingCredits, setBuyingCredits] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [linking, setLinking] = useState(false)
  const [opening, setOpening] = useState(false)
  const [unlinked, setUnlinked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Le session token (App Bridge) identifie la boutique ET le compte Xeyo :
      // le serveur ne fait plus confiance au `?shop=` de l'URL.
      //
      // ⚠️ `link-account` est le SEUL appel qui aboutit quand la boutique est déliée
      // (les deux autres exigent un compte Xeyo → 401, c'est normal et attendu).
      // ⚠️ RÉSYNCHRONISER AVANT DE LIRE.
      //
      // L'activation d'un plan repose sur le callback de facturation — qui peut ne
      // JAMAIS être appelé (onglet fermé, redirection bloquée, réseau coupé). Le
      // marchand a alors payé, Shopify le facture, mais notre base reste sur
      // `pending` : le contrôle de quota le fait retomber en GRATUIT à chaque
      // rafraîchissement. Il paie et n'a rien.
      //
      // On demande donc la vérité à Shopify AVANT d'afficher quoi que ce soit.
      // Best-effort : un échec ne doit jamais empêcher l'app de s'ouvrir.
      await authenticatedFetch('/api/shopify/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      }).catch(() => null)

      const [s, o, l] = await Promise.all([
        authenticatedFetch(`/api/shopify/status?shop=${encodeURIComponent(shop)}`).then((r) => r.json()).catch(() => null),
        authenticatedFetch('/api/shopify/embedded/overview').then((r) => r.json()).catch(() => null),
        authenticatedFetch('/api/shopify/embedded/link-account').then((r) => r.json()).catch(() => null),
      ])
      setStatus(s?.data ?? null)
      const ov = (o?.data as Overview | undefined) ?? null
      setOverview(ov)
      // Le sélecteur reflète l'abonnement EN COURS : sinon un marchand déjà en
      // annuel verrait « Mensuel » coché et croirait devoir rebasculer.
      if (ov?.billingInterval) setBillingInterval(ov.billingInterval)
      setLinkState((l?.data as LinkState | undefined) ?? null)
    } finally {
      setLoading(false)
    }
  }, [shop])

  useEffect(() => { load() }, [load])

  /**
   * Recharger quand le marchand REVIENT sur cet onglet.
   *
   * La liaison du compte se fait sur app.xeyo.io, dans un AUTRE onglet (« J'ai déjà un
   * compte Xeyo »). Sans ceci, il revient ici et retrouve l'écran « Reliez votre
   * compte » — alors que sa boutique est déjà reliée. Il croit que ça a échoué et
   * recommence en boucle.
   */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [load])

  /**
   * Sort de l'iframe pour afficher un écran Shopify (approbation de facturation).
   *
   * ⚠️ Pourquoi on ne peut PAS utiliser `window.open` ici.
   *
   * Un `window.open` déclenché depuis une iframe, après un `await`, est bloqué par
   * le navigateur : il n'est plus rattaché au clic de l'utilisateur. C'est ce qui
   * produisait « Autorisez les pop-ups pour approuver l'abonnement » — le marchand
   * ne pouvait tout simplement PAS s'abonner.
   *
   * L'écran d'approbation de Shopify refuse par ailleurs de s'afficher dans une
   * iframe. Il DOIT donc être chargé au niveau supérieur. Ce n'est pas un
   * « échappement » interdit : c'est le mécanisme prévu pour la facturation.
   */
  const redirectTop = (url: string) => {
    try {
      if (window.top) {
        window.top.location.href = url
        return
      }
    } catch {
      // `window.top` est inaccessible (origines croisées) : on retombe plus bas.
    }
    window.location.href = url
  }

  /**
   * Recharge de conversations IA, sans quitter l'admin Shopify.
   *
   * Achat ponctuel (`appPurchaseOneTimeCreate`) : le marchand approuve dans
   * Shopify, comme pour un abonnement. Il fallait auparavant ouvrir l'app Xeyo
   * pour recharger — alors que le compteur, lui, n'était même pas visible ici.
   */
  const rechargeCredits = async () => {
    setBuyingCredits(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/billing/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, pack: 'ai_credits' }),
      })
      const json = await res.json()
      const url = json?.data?.confirmationUrl
      if (!res.ok || !url) throw new Error(json.error || t.errPurchase)
      // ⚠️ `redirectTop`, PAS `openInTop` (qui préfixe par APP_BASE et casserait
      // l'URL Shopify). L'écran d'approbation refuse l'iframe : il doit s'ouvrir
      // au niveau supérieur — même mécanisme que pour l'abonnement.
      redirectTop(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errPurchase)
      setBuyingCredits(false)
    }
  }

  /** Abonnement via la Billing API — le marchand approuve DANS Shopify. */
  const subscribe = async (plan: string, billing: 'monthly' | 'annual' = billingInterval) => {
    setBusyPlan(plan)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Le code promo était accepté par le serveur, mais rien ne l'envoyait :
        // aucun champ n'existait pour le saisir.
        // `billing` : sans lui, tout marchand était facturé au MOIS, même en
        // choisissant l'annuel — l'intervalle n'était jamais transmis d'ici.
        // `origin` : ramène le marchand ICI s'il annule sur l'écran Shopify.
        body: JSON.stringify({ shop, plan, billing, origin: 'embedded', ...(promoCode.trim() ? { promo_code: promoCode.trim() } : {}) }),
      })
      const json = await res.json()
      const url = json?.data?.confirmationUrl
      if (!res.ok || !url) throw new Error(json.error || t.errBilling)

      // ⚠️ `window.open` DEPUIS UNE IFRAME EST BLOQUÉ PAR LE NAVIGATEUR.
      //
      // C'est ce qui produisait « Autorisez les pop-ups pour approuver
      // l'abonnement » : le marchand ne pouvait tout simplement PAS s'abonner. Une
      // app dont on ne peut pas acheter l'abonnement est un rejet certain.
      //
      // L'écran d'approbation de Shopify refuse d'ailleurs de s'afficher dans une
      // iframe (`X-Frame-Options`). Il DOIT donc s'ouvrir au niveau supérieur — ce
      // n'est pas un « échappement » interdit, c'est le mécanisme prévu : App Bridge
      // expose `window.top.location` précisément pour la facturation.
      redirectTop(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errGeneric)
      setBusyPlan(null)
    }
  }

  /**
   * Annulation — le marchand garde son accès jusqu'à la fin de la période payée.
   *
   * ⚠️ On coupait l'accès SUR-LE-CHAMP : le marchand perdait le mois qu'il venait de
   * régler (Shopify ne rembourse pas au prorata). Désormais le renouvellement est
   * coupé, mais il profite de ce qu'il a payé jusqu'à l'échéance.
   *
   * On le lui DIT avant : sans ça, il croit avoir perdu son argent — ou, à l'inverse,
   * s'étonne d'avoir encore accès après avoir annulé.
   */
  const cancel = async () => {
    const until = overview?.periodEnd
      ? new Date(overview.periodEnd).toLocaleDateString(t.locale)
      : null

    const ok = window.confirm(until ? t.confirmCancelUntil(until) : t.confirmCancel)
    if (!ok) return

    setBusyPlan('cancel')
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/billing/cancel', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t.errGeneric)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errGeneric)
    } finally {
      setBusyPlan(null)
    }
  }

  /**
   * Délie la boutique de son compte Xeyo actuel.
   *
   * En embedded, l'identité vient du session token → de la BOUTIQUE, jamais de la
   * personne : tout le staff Shopify voit les données du compte Xeyo propriétaire.
   * Sans cette action, un marchand ouvrant l'app avec un autre compte resterait
   * bloqué sur les données du premier compte lié, sans aucun moyen d'en changer.
   */
  const unlink = async () => {
    if (!window.confirm(t.confirmUnlink)) return
    setUnlinking(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/embedded/unlink', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t.errGeneric)
      setUnlinked(true)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errGeneric)
    } finally {
      setUnlinking(false)
    }
  }

  /**
   * (Re)lie la boutique à un compte Xeyo — sortie de secours de la déliaison.
   *
   * Le serveur rattache le compte Xeyo portant l'email de la boutique (ou le crée).
   * Après succès on recharge : `status` et `overview` répondent de nouveau, l'app
   * repasse en affichage normal.
   */
  /**
   * PORTE 1 — « Continuer en tant que <moi> » (sans friction).
   *
   * Shopify a vérifié l'identité de la personne connectée à l'admin
   * (`associated_user.email_verified`). On rattache — ou on crée — SON compte, et la
   * boutique lui revient. Aucun mot de passe à saisir.
   */
  const createAccount = async () => {
    setLinking(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/embedded/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const json = await res.json()
      if (!res.ok || !json?.data?.linked) throw new Error(json?.error || t.errLink)
      setUnlinked(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errGeneric)
    } finally {
      setLinking(false)
    }
  }

  /**
   * PORTE 2 — « J'ai déjà un compte Xeyo » (le cas qui bloquait tout).
   *
   * On ne devine PAS lequel : on renvoie le marchand sur app.xeyo.io avec un jeton de
   * liaison signé. Il s'y connecte au compte de SON choix (Gmail perso, Google, ou
   * celui qui gère déjà ses autres boutiques) et c'est CE compte qui prend la boutique.
   *
   * ⚠️ Nouvel onglet, jamais une navigation de l'iframe : toutes les pages hors
   * /shopify envoient `X-Frame-Options: DENY` → l'iframe afficherait une page blanche.
   */
  const linkExisting = async () => {
    setLinking(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/embedded/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link' }),
      })
      const json = await res.json()
      if (!res.ok || !json?.data?.linkUrl) throw new Error(json?.error || t.errLink)

      // ⚠️ `window.open` depuis une iframe est BLOQUÉ par le navigateur — ce bouton
      // ne fonctionnait donc pas. Or c'est LE chemin qui permet au marchand de relier
      // sa boutique au compte de son choix : sans lui, il retombe dans le cercle
      // vicieux (l'app lui impose le compte de `shop.email`).
      //
      // On sort au niveau supérieur : app.xeyo.io renvoie `X-Frame-Options: DENY`,
      // la page ne peut de toute façon pas s'afficher dans l'iframe.
      redirectTop(json.data.linkUrl)
    } catch (e) {
      // Pas de `finally` : en cas de succès on quitte la page, l'état n'a plus de sens.
      setError(e instanceof Error ? e.message : t.errGeneric)
      setLinking(false)
    }
  }

  /**
   * Ouvre app.xeyo.io en CONNECTANT le marchand (onboarding ou dashboard).
   *
   * Sans ça, il arriverait sur la page de connexion : son compte Xeyo a été créé
   * automatiquement à l'installation (resolveXeyoUser), il n'a donc jamais choisi de
   * mot de passe — et l'iframe ne lui pose aucun cookie de session. On demande donc
   * au serveur un lien de connexion à usage unique.
   *
   * ⚠️ On ouvrait un onglet AVANT l'await, pour esquiver le blocage des pop-ups.
   * Ça ne suffisait pas : le navigateur bloque de toute façon l'ouverture d'onglets
   * depuis une iframe. On sort donc au niveau supérieur (`redirectTop`), ce qui ne
   * peut pas être bloqué.
   */
  const openXeyo = async () => {
    setOpening(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/embedded/login-link', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json?.data?.url) throw new Error(json.error || t.errOpen)

      // ⚠️ On ouvrait un onglet AVANT l'await pour esquiver le blocage des pop-ups.
      // Ça ne suffit pas : le navigateur bloque tout de même l'ouverture d'onglets
      // depuis une iframe — d'où « Autorisez les pop-ups pour ouvrir Xeyo ».
      //
      // On sort donc de l'iframe au NIVEAU SUPÉRIEUR. Une navigation du haut ne peut
      // pas être bloquée, contrairement à un onglet.
      //
      // ⚠️ NE JAMAIS faire `window.location.href = …` : ça naviguerait l'IFRAME, et
      // app.xeyo.io renvoie `X-Frame-Options: DENY` sur toutes ses pages sauf
      // /shopify → page blanche, marchand bloqué.
      redirectTop(json.data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errGeneric)
      setOpening(false)
    }
  }

  /** Pages Xeyo non embeddables (builder, conversations complètes…). */
  const openInTop = (path: string) => {
    const url = `${APP_BASE}${path}`
    // Ces pages renvoient `X-Frame-Options: DENY` : elles ne peuvent pas s'afficher
    // dans l'iframe. On sort donc au niveau supérieur — un `window.open` depuis une
    // iframe se fait bloquer, et le marchand ne pouvait tout simplement pas y accéder.
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      redirectTop(url)
    } else {
      window.location.href = url // hors iframe : navigation normale
    }
  }

  const currentPlan = overview?.plan || status?.plan || 'free'
  const isPaid = currentPlan !== 'free'

  const setupSteps = [
    { key: 'whatsapp', label: t.stepWhatsapp, done: !!status?.whatsapp_connected, path: '/dashboard' },
    { key: 'agent', label: t.stepAgent, done: !!status?.agent, path: '/agents' },
    { key: 'templates', label: t.stepTemplates, done: (status?.approved_templates ?? 0) > 0, path: '/templates' },
  ]

  return (
    <div className="min-h-screen bg-[#f1f1f1] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Retour de l'écran de facturation Shopify. Une annulation n'est PAS une
            erreur : ton discret plutôt que rouge, pour ne pas alarmer le marchand
            qui a simplement changé d'avis. */}
        {billingNotice && billingNoticeOpen && (
          <div
            className={
              billingNotice.ok
                ? 'flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'
                : 'flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
            }
          >
            <span className="flex-1">{billingNotice.text}</span>
            <button
              type="button"
              onClick={() => setBillingNoticeOpen(false)}
              aria-label={t.dismiss}
              className="shrink-0 rounded px-1 text-base leading-none opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/xeyo-logo.png" alt="Xeyo" className="h-8 w-8 object-contain" />
          <h1 className="text-lg font-semibold text-gray-800">{t.appTitle}</h1>

          {/* ⚠️ Le seul accès au dashboard n'existait QUE pendant l'onboarding.
              Une fois configuré, le marchand n'avait plus AUCUN moyen d'ouvrir Xeyo
              depuis l'app Shopify — or l'essentiel s'y passe (conversations, agent,
              campagnes). L'app embedded n'en montre qu'un aperçu.

              Le lien de connexion est à usage unique : il entre directement, sans
              avoir à retrouver un mot de passe qu'il n'a peut-être jamais choisi. */}
          {!loading && linkState?.linked && (
            <button
              type="button"
              onClick={openXeyo}
              disabled={opening}
              className="ml-auto shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
            >
              {opening ? t.opening : t.openApp}
            </button>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
            {t.loading}
          </div>
        ) : linkState && linkState.installed && !linkState.linked ? (
          /* ── BOUTIQUE DÉLIÉE (user_id = NULL) ──
             Sans cette branche : `/api/shopify/status` et `/api/shopify/embedded/overview`
             répondent 401 (plus de compte Xeyo à résoudre), `status` vaut null et le
             marchand tombe sur « Installation requise » — voire une page blanche — sans
             aucun moyen de s'en sortir depuis l'admin Shopify. On lui offre donc ici la
             seule action qui fonctionne encore sans compte : relier la boutique.
             ⚠️ DOIT rester AVANT `!status?.installed` : l'app EST installée, elle n'est
             simplement plus reliée à un compte. */
          <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center space-y-5">
            {/* En-tête d'accueil : c'est très souvent le PREMIER écran vu après
                l'installation depuis l'App Store. */}
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/xeyo-logo.png" alt="Xeyo" className="mx-auto h-12 w-12 object-contain" />
              <h2 className="mt-4 text-2xl font-semibold text-gray-900">{t.welcomeTitle}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t.welcomeSubtitle}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                <p className="text-xs font-semibold text-gray-900">{t.featureAutoTitle}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  {t.featureAutoDesc}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                <p className="text-xs font-semibold text-gray-900">{t.featureCartTitle}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  {t.featureCartDesc}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                <p className="text-xs font-semibold text-gray-900">{t.featureOrderTitle}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  {t.featureOrderDesc}
                </p>
              </div>
            </div>

            {/* ── LES DEUX PORTES ──────────────────────────────────────────────
                Exigence Shopify (Built for Shopify 3.1.3) : offrir à la fois une
                inscription SANS FRICTION et la connexion d'un compte EXISTANT.

                C'est aussi la sortie du cercle vicieux : on n'IMPOSE plus le compte
                de `shop_email`. Le marchand choisit. */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h3 className="text-base font-semibold text-gray-900">{t.linkTitle}</h3>
              <p className="mt-2 text-sm text-gray-500">
                {t.linkDesc}
              </p>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-5 space-y-2">
                {/* PORTE 1 — sans friction. Shopify nous a VÉRIFIÉ son identité :
                    aucun mot de passe, aucun formulaire. Un clic et il entre. */}
                {linkState.canCreate && linkState.staffEmail && (
                  <button
                    type="button"
                    onClick={createAccount}
                    disabled={linking}
                    className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                  >
                    {linking
                      ? t.linking
                      : linkState.hasAccount
                        ? t.continueAs(linkState.staffEmail)
                        : t.createAccountAs(linkState.staffEmail)}
                  </button>
                )}

                {/* PORTE 2 — le cas qui bloquait TOUT jusqu'ici.
                    Le marchand inscrit avec un autre email (Gmail perso, Google, ou le
                    compte qui gère déjà ses autres boutiques) va enfin pouvoir relier
                    SA boutique à SON compte : on l'envoie choisir sur app.xeyo.io avec
                    un jeton signé, au lieu de lui réimposer celui de la boutique. */}
                <button
                  type="button"
                  onClick={linkExisting}
                  disabled={linking}
                  className={
                    linkState.canCreate
                      ? 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60'
                      : 'w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60'
                  }
                >
                  {t.haveAccount}
                </button>
              </div>

              {/* Un collaborateur (agence, freelance) n'est pas le marchand : la
                  boutique ne doit pas atterrir sur son compte perso. */}
              {linkState.isCollaborator ? (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-400">
                  {t.collaboratorNote}
                </p>
              ) : (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-400">
                  {t.linkHint}
                </p>
              )}
            </div>
          </div>
        ) : !status?.installed ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
            <h2 className="text-base font-semibold text-gray-900">{t.notInstalledTitle}</h2>
            <p className="mt-2 text-sm text-gray-500">
              {t.notInstalledDesc}
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {/* ── ONBOARDING À TERMINER ──
                L'onboarding (WhatsApp, agent IA, modèles) se fait sur app.xeyo.io, hors de
                l'iframe : sans ce rappel, le marchand fraîchement installé reste devant un
                tableau vide (0 contact, 0 conversation) sans savoir quoi faire. */}
            {overview?.onboardingDone === false && (
              <div className="rounded-2xl bg-blue-50 p-6 ring-1 ring-blue-200">
                <h2 className="text-base font-semibold text-gray-900">{t.setupTitle}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {t.setupDesc}
                </p>
                <button
                  type="button"
                  onClick={openXeyo}
                  disabled={opening}
                  className="mt-4 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                >
                  {opening ? t.opening : t.setupCta}
                </button>
              </div>
            )}

            {/* ── DONNÉES CLIENTS collectées (requirement 5.1.5) ── */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">{t.contactsTitle}</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {t.contactsDesc}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-2xl font-bold tabular-nums text-gray-900">{overview?.contactsCount ?? 0}</p>
                  <p className="text-xs text-gray-500">{t.contactsLabel}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">{overview?.optedInCount ?? 0}</p>
                  <p className="text-xs text-gray-500">{t.optedInLabel}</p>
                </div>
              </div>
            </div>

            {/* ── CONVERSATIONS RÉCENTES (requirement 5.1.5) ── */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-sm font-semibold text-gray-900">{t.conversationsTitle}</h2>
                <button
                  type="button"
                  onClick={() => openInTop('/conversations')}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
                >
                  {t.seeAll}
                </button>
              </div>
              {(overview?.conversations?.length ?? 0) === 0 ? (
                <p className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
                  {t.noConversations}
                </p>
              ) : (
                overview!.conversations.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 border-t border-gray-100 px-6 py-3">
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                        {c.optedIn && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            {t.optInBadge}
                          </span>
                        )}
                        {c.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-500">{c.preview || '—'}</p>
                    </div>
                    {c.lastMessageAt && (
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {new Date(c.lastMessageAt).toLocaleDateString(t.locale)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── CRÉDITS IA ─────────────────────────────────────────────────
                Le marchand ne pouvait ni voir ce qu'il lui restait, ni recharger,
                sans quitter l'admin Shopify. Le quota du plan (remis à zéro chaque
                mois) et les recharges (qui ne périment pas) sont distingués. */}
            {isPaid && overview?.credits && (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{t.creditsTitle}</h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t.creditsDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={rechargeCredits}
                    disabled={buyingCredits}
                    className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 disabled:opacity-60"
                  >
                    {buyingCredits ? t.opening : t.topUp}
                  </button>
                </div>

                {(() => {
                  const c = overview.credits!
                  if (c.unlimited) {
                    return (
                      <p className="mt-4 text-sm text-gray-700">
                        <span className="font-semibold">{c.used.toLocaleString(t.locale)}</span> {t.creditsThisMonth}
                        <span className="ml-1 font-medium text-emerald-600">{t.unlimited}</span>
                      </p>
                    )
                  }
                  const planLimit = c.planLimit ?? 0
                  const planLeft = Math.max(0, planLimit - c.planUsed)
                  const pct = planLimit > 0 ? Math.min(100, Math.round((c.planUsed / planLimit) * 100)) : 0
                  return (
                    <div className="mt-4 space-y-3">
                      <div>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-gray-700">
                            <span className="font-semibold text-gray-900">{planLeft.toLocaleString(t.locale)}</span> {t.remaining}
                            <span className="text-gray-500">{t.outOfIncluded(planLimit.toLocaleString(t.locale))}</span>
                          </span>
                          <span className={pct >= 95 ? 'font-medium text-rose-600' : pct >= 80 ? 'font-medium text-amber-600' : 'text-gray-500'}>
                            {pct}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 95 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-gray-400">{t.resetsNextRenewal}</p>
                      </div>

                      {c.extra > 0 && (
                        <div className="rounded-lg bg-amber-50 px-3 py-2">
                          <p className="text-xs text-amber-900">
                            <span className="font-semibold">{c.extraRemaining.toLocaleString(t.locale)}</span> {t.extraInReserve}
                            <span className="ml-1">{t.neverExpire}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── ABONNEMENT (requirements 1.2.1 / 1.2.3 — géré DANS l'admin) ── */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{t.subscriptionTitle}</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.subscriptionDesc}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
                  {t.planBadge(currentPlan)}
                </span>
              </div>

              {/* Un changement est PROGRAMMÉ (baisse de plan ou annulation) : le
                  marchand garde son plan actuel jusqu'à l'échéance. Sans ce bandeau, il
                  croit que son action n'a pas été prise en compte — ou, à l'inverse,
                  s'étonne d'avoir encore accès après avoir annulé. */}
              {overview?.pendingPlan && overview.pendingPlan !== currentPlan && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs text-amber-900">
                    {overview.pendingPlan === 'free' ? (
                      <>
                        <span className="font-semibold">{t.cancelledLabel}</span> {t.youKeepPlan}{' '}
                        <span className="capitalize">{currentPlan}</span>
                        {overview.periodEnd
                          ? t.untilDate(new Date(overview.periodEnd).toLocaleDateString(t.locale))
                          : t.untilPeriodEnd}
                        {t.thenSubscriptionEnds}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{t.scheduledLabel}</span> {t.youKeepPlan}{' '}
                        <span className="capitalize">{currentPlan}</span>
                        {overview.periodEnd
                          ? t.untilDate(new Date(overview.periodEnd).toLocaleDateString(t.locale))
                          : t.untilPeriodEnd}
                        {t.thenYouSwitchTo}{' '}
                        <span className="capitalize">{overview.pendingPlan}</span>
                        {t.planSuffix}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* ── MENSUEL / ANNUEL ────────────────────────────────────────
                  Le sélecteur n'existait pas ici : l'intervalle n'était jamais
                  transmis, donc TOUT marchand était facturé au mois — et un
                  marchand en mensuel ne pouvait pas passer à l'annuel. */}
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBillingInterval('monthly')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    billingInterval === 'monthly' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t.monthly}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('annual')}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    billingInterval === 'annual' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t.annual}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    billingInterval === 'annual' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {t.annualDiscount}
                  </span>
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {PLANS.map((p) => {
                  // ⚠️ « Plan actuel » = MÊME plan ET MÊME intervalle.
                  //
                  // On ne comparait que le plan : un marchand en Pro MENSUEL voyait
                  // la carte Pro grisée « Plan actuel » même en sélectionnant
                  // « Annuel » — il ne pouvait donc PAS passer à l'annuel.
                  const active = currentPlan === p.id && (overview?.billingInterval ?? 'monthly') === billingInterval
                  // `disabled` UNIQUEMENT sur le plan courant ou celui en cours de
                  // souscription. Le désactiver dès qu'un autre bouton travaille
                  // grisait TOUTES les cartes (opacity-60), rendant les prix illisibles.
                  const busy = busyPlan === p.id
                  // Prix annuel = mensuel × 12 − 20 % (aligné sur ANNUAL_DISCOUNT).
                  const annual = Math.round(p.price * 12 * 0.8)
                  return (
                    /* ⚠️ Ces cartes ÉTAIENT déjà cliquables — mais rien ne le disait.
                       Aucun appel à l'action, aucun bouton : le marchand voyait une
                       simple grille de tarifs et pensait ne pas pouvoir s'abonner
                       depuis l'app. Or l'App Store EXIGE qu'il puisse changer de plan
                       sans contacter le support (§1.2.3). On rend l'action explicite. */
                    <button
                      key={p.id}
                      type="button"
                      disabled={active || busy}
                      onClick={() => subscribe(p.id)}
                      className={`group rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white hover:border-gray-900 hover:shadow-md'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-900'}`}>{p.name}</p>
                      <p className={`text-xs ${active ? 'text-white/70' : 'text-gray-600'}`}>
                        {t.planDesc(p.aiConv.toLocaleString(t.locale))}
                      </p>
                      <p className={`mt-1 text-sm font-bold ${active ? 'text-white' : 'text-gray-900'}`}>
                        {billingInterval === 'annual'
                          ? t.perYear(String(annual))
                          : t.perMonth(String(p.price))}
                      </p>
                      {billingInterval === 'annual' && (
                        <p className={`text-[11px] ${active ? 'text-white/70' : 'text-emerald-600'}`}>
                          {t.annualEquivalent(String(Math.round(annual / 12)))}
                        </p>
                      )}

                      <span
                        className={`mt-2.5 flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                          active
                            ? 'bg-white/15 text-white/80'
                            : 'bg-gray-900 text-white group-hover:bg-gray-700'
                        }`}
                      >
                        {busy
                          ? t.opening
                          : active
                            ? t.currentPlan
                            : // Même plan, autre intervalle : « Changer » serait
                              // ambigu — on dit ce qui va réellement se passer.
                              currentPlan === p.id
                              ? (billingInterval === 'annual' ? t.switchToAnnual : t.switchToMonthly)
                              : isPaid
                                ? t.switchPlan
                                : t.choosePlan}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* ⚠️ LE CODE PROMO N'AVAIT AUCUN CHAMP DE SAISIE.
                  Le serveur l'acceptait, la remise Shopify était bien appliquée — mais
                  rien, nulle part, ne permettait au marchand de l'entrer. L'admin
                  pouvait créer des codes que personne ne pouvait utiliser.

                  Replié par défaut : un champ « code promo » toujours visible pousse
                  le marchand à en chercher un, et à hésiter s'il n'en a pas.

                  ⚠️ AFFICHÉ AUSSI POUR UN MARCHAND DÉJÀ ABONNÉ.
                  La condition était `!isPaid` : le champ disparaissait dès qu'on
                  avait un abonnement. Or un code s'applique tout autant à un
                  CHANGEMENT de plan (monter en gamme, passer à l'annuel avec un
                  tarif fondateur) — c'est même le cas le plus fréquent. Le
                  marchand voyait donc les plans, mais aucun moyen de saisir son
                  code. */}
              <div className="mt-3">
                  {showPromo ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder={t.promoPlaceholder}
                        autoFocus
                        // ⚠️ `bg-white text-gray-900` EXPLICITES : sans elles,
                        // l'input héritait de la couleur de texte du thème
                        // (claire) sur un fond blanc → le code saisi était
                        // illisible, blanc sur blanc. Cette vue est toujours en
                        // thème clair (admin Shopify), on fige donc les deux.
                        className="w-40 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs uppercase tracking-wide text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
                      />
                      <span className="text-[11px] text-gray-400">
                        {t.promoHint}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPromo(true)}
                      className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
                    >
                      {t.promoToggle}
                    </button>
                  )}
              </div>

              {/* Shopify EXIGE l'approbation du marchand pour toute modification
                  d'abonnement — on le prévient, sinon la redirection le surprend. */}
              <p className="mt-3 text-[11px] text-gray-400">
                {t.billingNote}
              </p>

              {/* Annulation : bouton dédié (App Store 1.2.3 — le marchand doit
                  pouvoir annuler sans contacter le support). Affiché seulement s'il
                  a un abonnement actif. L'accès reste ouvert jusqu'à la fin de la
                  période payée. */}
              {isPaid && (
                <button
                  type="button"
                  onClick={() => cancel()}
                  disabled={busyPlan === 'cancel'}
                  className="mt-3 text-xs font-medium text-gray-400 underline hover:text-gray-700 disabled:opacity-60"
                >
                  {busyPlan === 'cancel' ? t.cancelling : t.cancelSubscription}
                </button>
              )}
            </div>

            {/* ── CONFIGURATION restante ── */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <h2 className="px-6 py-4 text-sm font-semibold text-gray-900">{t.configTitle}</h2>
              {setupSteps.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => openInTop(s.path)}
                  className="flex w-full items-center gap-3 border-t border-gray-100 px-6 py-3 text-left transition hover:bg-gray-50"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {s.done ? '✓' : '!'}
                  </span>
                  <span className={`flex-1 text-sm ${s.done ? 'text-gray-900' : 'text-gray-600'}`}>{s.label}</span>
                  <span className="text-gray-300">→</span>
                </button>
              ))}
            </div>

            {/* ── COMPTE XEYO RELIÉ (action rare, volontairement discrète) ── */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">{t.accountTitle}</h2>
              {unlinked ? (
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  {t.unlinkedNoticeBefore}{' '}
                  <span className="font-medium text-gray-900">app.xeyo.io</span>{' '}
                  {t.unlinkedNoticeAfter}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    {t.linkedTo}{' '}
                    <span className="font-medium text-gray-900">
                      {overview?.linkedAccountEmail || '—'}
                    </span>
                    .
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.teamNote}
                  </p>
                  <button
                    type="button"
                    onClick={unlink}
                    disabled={unlinking}
                    className="mt-3 text-xs font-medium text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
                  >
                    {unlinking ? t.unlinking : t.unlinkStore}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
