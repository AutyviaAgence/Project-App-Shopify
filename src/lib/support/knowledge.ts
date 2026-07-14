/**
 * BASE DE CONNAISSANCES DU SUPPORT.
 *
 * Chaque entrée associe une question à une réponse ET à un endroit de l'interface.
 * C'est ce qui permet à l'assistant de MONTRER au lieu de décrire : quand le
 * marchand demande « où je connecte WhatsApp ? », on l'amène sur la bonne page et
 * on surligne la bonne carte.
 *
 * ── POURQUOI UNE RECHERCHE AVANT L'IA ────────────────────────────────────────
 *
 * La majorité des questions de support sont les mêmes. Y répondre par une recherche
 * de mots-clés est instantané, gratuit, et la réponse est toujours juste. L'IA n'est
 * appelée QUE si rien ne correspond — sinon chaque « comment je connecte WhatsApp ? »
 * coûterait des tokens (sur notre compte, pas celui du marchand).
 */

export type HelpTopic = {
  id: string
  /** Mots-clés déclencheurs. Sans accent, en minuscules — la recherche normalise. */
  keywords: string[]
  question: string
  answer: string
  /** Où aller. Absent = la réponse se suffit à elle-même. */
  page?: string
  /** Quoi surligner sur cette page (attribut `data-tour`). */
  target?: string
}

export const HELP_TOPICS: HelpTopic[] = [
  // ── Connexions ────────────────────────────────────────────────────────────
  {
    id: 'connect-whatsapp',
    keywords: ['whatsapp', 'connecter', 'connexion', 'numero', 'brancher', 'relier whatsapp', 'waba', 'meta'],
    question: 'Comment connecter mon numéro WhatsApp ?',
    answer:
      'Depuis le tableau de bord, utilisez la carte « Connexion WhatsApp ». Il vous faudra votre Phone Number ID, votre Business Account ID et votre token d’accès, tous trois issus de votre app Meta (WhatsApp → API Setup).',
    page: '/dashboard',
    target: 'whatsapp-connect',
  },
  {
    id: 'connect-shopify',
    keywords: ['shopify', 'boutique', 'connecter boutique', 'relier boutique', 'installer'],
    question: 'Comment relier ma boutique Shopify ?',
    answer:
      'Depuis le tableau de bord, la carte « Boutique Shopify » vous guide. Si votre boutique est déjà installée, ouvrez Xeyo depuis votre admin Shopify et cliquez sur « J’ai déjà un compte Xeyo » : la boutique sera rattachée à ce compte.',
    page: '/dashboard',
    target: 'shopify-connect',
  },

  // ── Agent IA ──────────────────────────────────────────────────────────────
  {
    id: 'create-agent',
    keywords: ['agent', 'ia', 'creer agent', 'configurer agent', 'chatbot', 'assistant'],
    question: 'Comment créer ou configurer mon agent IA ?',
    answer:
      'Rendez-vous sur la page « Agents IA ». Vous pouvez y créer un agent, définir son ton, ses instructions et les situations où il doit passer la main à un humain.',
    page: '/agents',
    target: 'agents-header',
  },
  {
    id: 'agent-not-replying',
    keywords: ['agent ne repond pas', 'pas de reponse', 'ia ne repond pas', 'ne fonctionne pas', 'silence'],
    question: 'Mon agent IA ne répond pas',
    answer:
      'Trois causes possibles : (1) aucun numéro WhatsApp n’est connecté ; (2) l’agent est désactivé sur la conversation (icône en haut de la conversation) ; (3) votre quota de conversations IA est épuisé — vérifiez-le sur la page Abonnement.',
    page: '/conversations',
    target: 'conversations-header',
  },

  // ── Modèles ───────────────────────────────────────────────────────────────
  {
    id: 'templates',
    keywords: ['modele', 'template', 'message type', 'approbation', 'meta approuve'],
    question: 'Comment créer un modèle de message ?',
    answer:
      'Sur la page « Modèles ». Un modèle doit être approuvé par Meta avant de pouvoir être envoyé — l’approbation prend de quelques minutes à 24 h. Hors de la fenêtre de 24 h (quand le client n’a pas écrit récemment), c’est le seul moyen de le contacter.',
    page: '/templates',
    target: 'templates-header',
  },

  // ── Campagnes & automatisations ───────────────────────────────────────────
  {
    id: 'campaigns',
    keywords: ['campagne', 'envoi masse', 'newsletter', 'promotion', 'marketing'],
    question: 'Comment lancer une campagne ?',
    answer:
      'Sur la page « Campagnes ». Vous choisissez un modèle approuvé, ciblez vos contacts, et planifiez l’envoi. Seuls les contacts ayant donné leur accord (opt-in) sont contactables.',
    page: '/campaigns',
    target: 'campaigns-header',
  },
  {
    id: 'automations',
    keywords: ['automatisation', 'relance', 'panier abandonne', 'suivi commande', 'automatique'],
    question: 'Comment configurer une relance automatique ?',
    answer:
      'Dans « Automatisations », vous trouverez les relances de panier abandonné, les suivis de commande et les confirmations d’expédition. Chacune se déclenche sur un événement de votre boutique.',
    page: '/automations',
  },

  // ── Abonnement ────────────────────────────────────────────────────────────
  {
    id: 'change-plan',
    keywords: ['plan', 'abonnement', 'changer de plan', 'upgrade', 'passer a', 'tarif', 'prix'],
    question: 'Comment changer de plan ?',
    answer:
      'Sur la page « Abonnement », choisissez le plan voulu. Une montée en gamme prend effet immédiatement (Shopify vous crédite ce que vous avez déjà payé). Une baisse prend effet au prochain renouvellement — vous gardez votre plan actuel jusque-là.',
    page: '/subscription',
    target: 'plans-grid',
  },
  {
    id: 'cancel',
    keywords: ['annuler', 'resilier', 'arreter abonnement', 'stop', 'desabonner'],
    question: 'Comment annuler mon abonnement ?',
    answer:
      'Sur la page « Abonnement », choisissez le plan Gratuit. Vous conservez votre plan actuel jusqu’à la fin de la période déjà payée, puis vous repassez en gratuit. Aucun remboursement au prorata.',
    page: '/subscription',
    target: 'plans-grid',
  },
  {
    id: 'billing',
    keywords: ['facture', 'facturation', 'paiement', 'prelevement', 'carte'],
    question: 'Où trouver mes factures ?',
    answer:
      'Votre abonnement Xeyo est facturé avec votre facture Shopify : aucun moyen de paiement à saisir chez nous. Vos factures se trouvent dans votre admin Shopify, section Facturation.',
    page: '/subscription',
  },
  {
    id: 'promo-code',
    keywords: ['code promo', 'reduction', 'remise', 'coupon'],
    question: 'Où entrer un code promo ?',
    answer:
      'Le code promo se saisit au moment de choisir un plan, depuis l’app Xeyo dans votre admin Shopify : cliquez sur « J’ai un code promo » sous les plans. La remise s’affiche sur l’écran de confirmation Shopify avant validation.',
    page: '/subscription',
    target: 'plans-grid',
  },

  // ── Parrainage ────────────────────────────────────────────────────────────
  {
    id: 'referral',
    keywords: ['parrainage', 'parrainer', 'inviter', 'filleul', 'recompense', 'mois offert'],
    question: 'Comment fonctionne le parrainage ?',
    answer:
      'Partagez votre lien de parrainage (dans les Paramètres). Dès qu’un marchand s’inscrit via ce lien et s’abonne, vous recevez un mois offert, automatiquement déduit de votre prochaine facture Shopify.',
    page: '/settings',
    target: 'referral',
  },

  // ── Contacts & opt-in ─────────────────────────────────────────────────────
  {
    id: 'optin',
    keywords: ['contact', 'opt-in', 'optin', 'abonne', 'collecter', 'numero client', 'consentement'],
    question: 'Comment collecter des numéros WhatsApp ?',
    answer:
      'Trois moyens : la bulle WhatsApp sur votre boutique, la popup d’opt-in (page panier), et la case sur la page de remerciement après achat. Activez-les dans l’éditeur de thème Shopify, section Applications.',
    page: '/conversations',
    target: 'conversations-header',
  },

  // ── Quotas ────────────────────────────────────────────────────────────────
  {
    id: 'quota',
    keywords: ['quota', 'credit', 'limite', 'conversations ia', 'epuise', 'plus de credit'],
    question: 'Que se passe-t-il si j’épuise mes conversations IA ?',
    answer:
      'Votre agent cesse de répondre automatiquement, mais vous pouvez continuer à répondre à la main. Vous pouvez recharger des crédits (ils ne périment pas) ou passer à un plan supérieur.',
    page: '/subscription',
    target: 'plans-grid',
  },

  // ── Statistiques ──────────────────────────────────────────────────────────
  {
    id: 'stats',
    keywords: ['statistique', 'stats', 'chiffre', 'performance', 'resultat', 'analyse'],
    question: 'Où voir mes statistiques ?',
    answer:
      'Sur la page « Statistiques » : conversations, taux de réponse de l’agent, performance des campagnes et chiffre d’affaires attribué à WhatsApp.',
    page: '/stats',
    target: 'stats-header',
  },
]

/** Supprime les accents et la ponctuation : « Comment créer ? » → « comment creer ». */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cherche le sujet le plus proche de la question.
 *
 * Renvoie `null` si aucun ne correspond assez — c'est le signal qu'il faut passer
 * la main à l'IA. Mieux vaut avouer ne pas savoir que renvoyer une réponse hors
 * sujet, qui donnerait au marchand le sentiment de parler à un mur.
 */
export function searchTopic(question: string): HelpTopic | null {
  const q = normalize(question)
  if (q.length < 3) return null

  let best: { topic: HelpTopic; score: number } | null = null

  for (const topic of HELP_TOPICS) {
    let score = 0

    for (const kw of topic.keywords) {
      const k = normalize(kw)
      if (!k) continue
      // Un mot-clé de plusieurs mots qui apparaît tel quel est un signal fort.
      if (q.includes(k)) score += k.includes(' ') ? 3 : 2
    }

    // La question elle-même peut coïncider (« comment annuler mon abonnement »).
    const questionWords = normalize(topic.question).split(' ').filter((w) => w.length > 3)
    const matched = questionWords.filter((w) => q.includes(w)).length
    if (questionWords.length > 0) score += matched / questionWords.length

    if (score > 0 && (!best || score > best.score)) best = { topic, score }
  }

  // Seuil : au moins un vrai mot-clé touché. En dessous, c'est du bruit.
  return best && best.score >= 2 ? best.topic : null
}
