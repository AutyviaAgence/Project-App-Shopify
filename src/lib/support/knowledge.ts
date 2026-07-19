/**
 * BASE DE CONNAISSANCES DU SUPPORT.
 *
 * Chaque entrée décrit UNE action précise, avec l'endroit exact où la faire.
 *
 * ── POURQUOI UNE ENTRÉE PAR ACTION, ET NON PAR PAGE ─────────────────────────
 *
 * La première version regroupait par zone (« les automatisations »). Résultat :
 * « Où sont les automatisations ? » et « Comment en créer une ? » recevaient la
 * MÊME réponse — inutile dans les deux cas. Une entrée = une action = un endroit
 * précis à montrer.
 *
 * ── C'EST L'IA QUI CHOISIT, PAS DES MOTS-CLÉS ───────────────────────────────
 *
 * La première version cherchait par mots-clés. « Je peux contacter un humain ? »
 * matchait sur « contact » et répondait… sur la collecte de numéros clients. Le
 * mot était le même, le sens à l'opposé. Aucun réglage de mots-clés ne répare ça.
 *
 * L'IA lit donc TOUTE cette base et choisit l'entrée qui répond vraiment. Le coût
 * est négligeable (0,03 centime par question) : le filtre par mots-clés
 * n'économisait rien et cassait la qualité.
 */

export type HelpTopic = {
  id: string
  /** La question, telle qu'un marchand la poserait. */
  question: string
  /** La réponse. Concrète, avec les termes exacts affichés à l'écran. */
  answer: string
  /** Où aller. Absent = la réponse se suffit à elle-même. */
  page?: string
  /** Quoi surligner (attribut `data-tour`). Sans page, il ne sert à rien. */
  target?: string
  /** Précision affichée sous la réponse, quand le sujet a un piège. */
  note?: string
}

export const HELP_TOPICS: HelpTopic[] = [
  // ═══ CONNEXIONS ═══════════════════════════════════════════════════════════
  {
    id: 'connect-whatsapp',
    question: 'Comment connecter mon numéro WhatsApp ?',
    answer:
      'Sur le tableau de bord, la carte « Connectez votre WhatsApp Business » ouvre une fenêtre sécurisée Meta : vous choisissez votre numéro, et c’est fini. Aucun identifiant à recopier.',
    page: '/dashboard',
    target: 'whatsapp-connect',
  },
  {
    id: 'whatsapp-quality',
    question: 'Meta a mis mon numéro en « qualité critique », que faire ?',
    answer:
      'Meta note la qualité de votre numéro d’après les réactions de vos clients (blocages, signalements). En « critique », vos envois marketing sont suspendus — mais vous pouvez toujours répondre à ceux qui vous écrivent. La note remonte d’elle-même si vous cessez d’envoyer des messages non sollicités.',
    page: '/dashboard',
    target: 'whatsapp-connect',
    note: 'Envoyez moins de messages promotionnels et ciblez mieux : c’est le seul moyen de faire remonter la note.',
  },
  {
    id: 'connect-shopify',
    question: 'Comment relier ma boutique Shopify ?',
    answer:
      'Sur le tableau de bord, la carte « Boutique Shopify » propose « Installer depuis le Shopify App Store ». Shopify vous demandera d’autoriser l’accès, puis vous ramènera ici.',
    page: '/dashboard',
    target: 'shopify-connect',
  },
  {
    id: 'shopify-orphan',
    question: 'Ma boutique est installée mais pas reliée à mon compte',
    answer:
      'Deux solutions. Depuis le tableau de bord, si la boutique apparaît comme « en attente de liaison », cliquez sur « Relier à mon compte ». Sinon, ouvrez Xeyo depuis votre admin Shopify et cliquez sur « J’ai déjà un compte Xeyo » : la boutique sera rattachée au compte que vous choisirez.',
    page: '/dashboard',
    target: 'shopify-connect',
  },
  {
    id: 'shopify-sync',
    question: 'Que sait mon agent de ma boutique ? Comment resynchroniser ?',
    answer:
      'Xeyo récupère votre catalogue, vos pages et vos politiques (retour, livraison, remboursement). Sur la carte « Boutique Shopify », le lien « Voir le détail récupéré » vous montre exactement ce qui a été synchronisé, et l’icône de rafraîchissement relance la synchronisation.',
    page: '/dashboard',
    target: 'shopify-connect',
  },

  // ═══ AGENT IA ═════════════════════════════════════════════════════════════
  {
    id: 'agent-create',
    question: 'Comment créer mon premier agent IA ?',
    answer:
      'Sur la page « Agents IA », cliquez sur « Nouvel agent ». L’option « Automatique » est la plus rapide : Xeyo lit votre boutique et configure l’agent tout seul (ton, instructions, connaissances).',
    page: '/agents',
    target: 'new-agent-btn',
  },
  {
    id: 'agent-not-replying',
    question: 'Mon agent ne répond pas à mes clients',
    answer:
      'Vérifiez trois choses, dans cet ordre. (1) L’agent est-il activé ? Sur la page « Agents IA », le bouton d’alimentation de la pilule flottante doit être vert. (2) Est-il « agent référent » ? Seul le référent répond automatiquement à tous vos clients. (3) Vos crédits IA sont-ils épuisés ? Vérifiez sur la page Abonnement.',
    page: '/agents',
    target: 'agent-activate',
  },
  {
    id: 'agent-referent',
    question: 'C’est quoi un « agent référent » ?',
    answer:
      'C’est celui qui répond automatiquement à tous vos clients. Vous pouvez avoir plusieurs agents, mais un seul est référent à la fois. Sur la page « Agents IA », l’étoile de la pilule flottante permet de le désigner.',
    page: '/agents',
    target: 'agent-activate',
  },
  {
    id: 'agent-tone',
    question: 'Comment changer le ton de mon agent ?',
    answer:
      'Ouvrez votre agent, onglet « Personnalité ». Trois tons au choix : « Pro » (formel), « Chaleureux » (proche) ou « Détendu » (familier). Le changement s’applique immédiatement à ses prochaines réponses.',
    page: '/agents',
    target: 'agent-tone',
    note: 'Il faut d’abord ouvrir un agent : cliquez sur sa carte depuis la page Agents IA.',
  },
  {
    id: 'agent-prompt',
    question: 'Où j’écris les instructions de mon agent ?',
    answer:
      'Deux endroits, selon le niveau de détail. Dans l’onglet « Personnalité », le champ « Objectif » définit sa mission en une phrase. Dans l’onglet « Avancé », le « Prompt système » vous donne le contrôle total sur son comportement.',
    page: '/agents',
    target: 'agent-prompt',
    note: 'Il faut d’abord ouvrir un agent.',
  },
  {
    id: 'agent-escalation',
    question: 'Comment l’agent passe la main à un humain ?',
    answer:
      'Ouvrez votre agent, onglet « Comportement », et activez « Transfert vers un humain ». Vous choisissez le déclencheur : des mots-clés (« humain », « conseiller »), une détection par l’IA, ou les deux. Vous pouvez aussi définir le message envoyé au client au moment du transfert.',
    page: '/agents',
    target: 'agent-escalation',
    note: 'Il faut d’abord ouvrir un agent.',
  },
  {
    id: 'agent-knowledge',
    question: 'Comment ajouter ma FAQ ou mes documents à l’agent ?',
    answer:
      'Ouvrez votre agent, onglet « Savoir & médias », section « Savoir » : le bouton « Ajouter » accepte des PDF ou du texte. L’agent s’en servira pour répondre — en plus de votre catalogue Shopify, qu’il connaît déjà.',
    page: '/agents',
    target: 'agent-knowledge',
    note: 'Il faut d’abord ouvrir un agent.',
  },
  {
    id: 'agent-tools',
    question: 'Comment autoriser mon agent à annuler ou rembourser une commande ?',
    answer:
      'Sur la page « Agents IA », l’icône en forme de clé sur la carte de l’agent ouvre ses outils. Vous y activez ce qu’il a le droit de faire. Ces actions ne sont jamais exécutées seules : elles apparaissent dans la conversation et vous devez les valider.',
    page: '/agents',
    target: 'agent-tools-btn',
  },
  {
    id: 'agent-test',
    question: 'Comment tester mon agent avant de l’activer ?',
    answer:
      'Sur la page « Agents IA », l’icône en forme de bulle sur la carte de l’agent ouvre un chat de test. Posez-lui une question comme le ferait un client : il répond avec les vraies données de votre boutique, sans rien envoyer à personne.',
    page: '/agents',
    target: 'agents-header',
  },

  // ═══ MODÈLES ══════════════════════════════════════════════════════════════
  {
    id: 'template-why',
    question: 'Pourquoi je ne peux pas écrire librement à un client ?',
    answer:
      'C’est une règle de WhatsApp, pas de Xeyo. Vous ne pouvez écrire librement que dans les 24 h qui suivent le dernier message du client. Passé ce délai, seul un modèle approuvé par Meta peut le relancer.',
    page: '/templates',
    target: 'templates-header',
  },
  {
    id: 'template-create',
    question: 'Comment créer un modèle de message ?',
    answer:
      'Sur la page « Modèles », cliquez sur « Nouveau modèle ». Vous pouvez l’écrire vous-même, ou choisir « Générer avec l’IA » : vous répondez à trois questions et l’IA rédige le modèle pour vous.',
    page: '/templates',
    target: 'template-new-btn',
  },
  {
    id: 'template-submit',
    question: 'Comment faire approuver mon modèle par Meta ?',
    answer:
      'Une fois votre modèle rédigé, cliquez sur « Soumettre ». Meta l’examine — cela prend de quelques minutes à 24 h. Vous ne pouvez l’envoyer qu’une fois le statut passé à « Approuvé ».',
    page: '/templates',
    target: 'template-submit-btn',
    note: 'Si vous modifiez un modèle déjà approuvé, il faut le RESOUMETTRE : la version approuvée reste active chez Meta en attendant.',
  },
  {
    id: 'template-status',
    question: 'Que veut dire « En attente Meta » ou « Refusé » ?',
    answer:
      '« En attente Meta » : votre modèle est en cours d’examen, patientez. « Refusé » : Meta l’a rejeté — le motif est affiché, corrigez et resoumettez. « Modifié, à resoumettre » : vous avez changé un modèle déjà approuvé ; l’ancienne version reste active tant que vous n’avez pas resoumis.',
    page: '/templates',
    target: 'templates-header',
  },
  {
    id: 'template-variables',
    question: 'Comment personnaliser un modèle avec le prénom du client ?',
    answer:
      'Dans l’éditeur de modèle, le menu « Variable » de la barre d’outils insère des champs dynamiques : prénom du client, numéro de commande, montant, lien de suivi… Ils seront remplacés par les vraies valeurs à l’envoi.',
    page: '/templates',
    target: 'template-variables',
  },
  {
    id: 'template-buttons',
    question: 'Comment ajouter des boutons à mon modèle ?',
    answer:
      'Dans l’éditeur, la section « Boutons » propose quatre types : « Visiter le site » (lien), « Appeler », « Copier un code » (promo) et « Réponse rapide » (le client répond en un clic). Trois boutons au maximum par modèle.',
    page: '/templates',
    target: 'template-buttons',
  },

  // ═══ AUTOMATISATIONS ══════════════════════════════════════════════════════
  {
    id: 'automation-create',
    question: 'Comment créer une automatisation ?',
    answer:
      'Dans « Automatisations » → « Transactionnel », cliquez sur « Nouveau workflow ». L’assistant IA est le plus simple : vous décrivez ce que vous voulez, il construit le scénario. Vous pouvez aussi le monter à la main.',
    page: '/automations?tab=transactional',
    target: 'automation-new-btn',
  },
  {
    id: 'automation-cart',
    question: 'Comment relancer les paniers abandonnés ?',
    answer:
      'C’est une automatisation transactionnelle, déjà prête. Dans « Automatisations » → « Transactionnel », activez « Panier abandonné ». Elle se déclenche quand un client quitte votre boutique avec des articles dans son panier, après le délai que vous choisissez.',
    page: '/automations?tab=transactional',
    note: 'Le client doit avoir donné son accord WhatsApp (opt-in) pour être relancé.',
  },
  {
    id: 'automation-activate',
    question: 'Comment activer une automatisation ?',
    answer:
      'Ouvrez l’automatisation : l’interrupteur « Activé / Désactivé » est en haut à droite. Tant qu’elle est désactivée, elle ne se déclenche jamais, même si tout le reste est bien configuré.',
    page: '/automations?tab=transactional',
    target: 'automation-new-btn',
  },
  {
    id: 'automation-delay',
    question: 'Comment régler le délai avant l’envoi ?',
    answer:
      'Dans l’éditeur d’automatisation, ajoutez un bloc « Délai » entre le déclencheur et le message. Vous y choisissez combien de temps attendre — par exemple 1 h après l’abandon du panier, plutôt qu’immédiatement.',
    page: '/automations?tab=transactional',
    target: 'automation-new-btn',
  },
  {
    id: 'campaign-create',
    question: 'Comment envoyer une promotion à toute ma liste ?',
    answer:
      'Dans « Automatisations » → « Campagnes ». Vous choisissez un modèle approuvé par Meta, ciblez vos contacts, et planifiez l’envoi.',
    page: '/automations?tab=marketing',
    note: 'Seuls les contacts qui ont donné leur accord (opt-in) recevront votre campagne. C’est une obligation légale.',
  },
  {
    id: 'campaign-targeting',
    question: 'Comment cibler seulement certains contacts ?',
    answer:
      'Au moment de créer votre campagne, la section « Filtres de ciblage » permet de restreindre : par tag de conversation, par étape du cycle de vie, ou par inactivité (« ceux qui n’ont pas écrit depuis 30 jours »).',
    page: '/campaigns/new',
    target: 'campaign-targeting',
  },
  {
    id: 'campaign-blocked',
    question: 'Pourquoi ma campagne ne part pas ?',
    answer:
      'La cause la plus fréquente : aucun modèle approuvé par Meta. Une campagne ne peut utiliser qu’un modèle au statut « Approuvé ». Vérifiez vos modèles et soumettez-les si nécessaire.',
    page: '/templates',
    target: 'template-submit-btn',
  },

  // ═══ CONVERSATIONS ════════════════════════════════════════════════════════
  {
    id: 'conversation-ai-off',
    question: 'Comment reprendre la main sur une conversation ?',
    answer:
      'Ouvrez la conversation : l’interrupteur en haut du fil désactive l’IA pour ce client uniquement. Vous répondez alors vous-même, sans que l’agent intervienne. Réactivez-le quand vous voulez.',
    page: '/conversations',
    target: 'conversation-ai-toggle',
  },
  {
    id: 'conversation-reply',
    question: 'Comment répondre à la main, envoyer une photo ou un vocal ?',
    answer:
      'Dans la barre de saisie en bas de la conversation : le trombone joint un fichier, le micro enregistre un vocal, et l’icône en forme d’éclair insère une réponse pré-enregistrée (macro).',
    page: '/conversations',
    target: 'conversations-header',
  },
  {
    id: 'conversation-filter',
    question: 'Comment filtrer mes conversations ?',
    answer:
      'Le bouton « Filtres », au-dessus de la liste, permet de trier par session, par statut de l’IA (active ou non), ou par étape du cycle de vie.',
    page: '/conversations',
    target: 'conversations-filters',
  },
  {
    id: 'conversation-tags',
    question: 'Comment classer ou taguer mes conversations ?',
    answer:
      'Les étapes (tags) s’appliquent directement depuis la liste : cliquez sur les badges colorés d’une conversation. Le bouton « Gérer les étapes » permet de créer les vôtres.',
    page: '/conversations',
    target: 'conversations-filters',
  },
  {
    id: 'conversation-stop',
    question: 'Un client a écrit STOP, puis-je encore lui écrire ?',
    answer:
      'Non. Un client désinscrit ne peut plus être contacté — c’est une obligation légale, et WhatsApp sanctionne les infractions. Le badge « Désinscrit » apparaît en haut de sa conversation. Il peut se réabonner lui-même en vous réécrivant.',
    page: '/conversations',
    target: 'conversations-header',
  },
  {
    id: 'shopify-action-validate',
    question: 'Mon agent propose un remboursement, comment le valider ?',
    answer:
      'Le bandeau « Action à valider » apparaît dans la conversation. Vous voyez ce que l’agent propose (annulation, remboursement, code promo), et vous choisissez « Confirmer » ou « Refuser ». Rien n’est jamais exécuté sans votre accord.',
    page: '/conversations',
    target: 'conversations-header',
  },
  {
    id: 'new-conversation',
    question: 'Comment écrire à un nouveau numéro ?',
    answer:
      'Le bouton « + » en haut de la liste des conversations. Vous saisissez le numéro et choisissez un modèle approuvé — obligatoire pour un premier contact, WhatsApp l’exige.',
    page: '/conversations',
    target: 'conversations-header',
  },

  // ═══ CONTACTS & OPT-IN ════════════════════════════════════════════════════
  {
    id: 'collect-numbers',
    question: 'Comment collecter les numéros WhatsApp de mes clients ?',
    answer:
      'Trois moyens, tous à activer dans l’éditeur de thème Shopify (section Applications) : la bulle WhatsApp flottante, la popup sur la page panier, et la case à cocher sur la page de remerciement après achat.',
    note: 'Sans numéro WhatsApp connecté, ces éléments ne s’affichent pas sur votre boutique — il n’y aurait personne à contacter.',
  },

  // ═══ ABONNEMENT ═══════════════════════════════════════════════════════════
  {
    id: 'change-plan',
    question: 'Comment changer de plan ?',
    answer:
      'Sur la page « Abonnement », choisissez le plan voulu. Une montée en gamme prend effet immédiatement — Shopify vous crédite ce que vous avez déjà payé. Une baisse prend effet au prochain renouvellement : vous gardez votre plan actuel jusque-là.',
    page: '/subscription',
    target: 'plans-grid',
  },
  {
    id: 'cancel-subscription',
    question: 'Comment annuler mon abonnement ?',
    answer:
      'Sur la page « Abonnement », choisissez le plan Gratuit (ou le bouton d’annulation). Vous conservez votre plan actuel jusqu’à la fin de la période déjà payée, puis vous repassez en gratuit.',
    page: '/subscription',
    target: 'cancel-subscription',
    note: 'Aucun remboursement au prorata : ce que vous avez payé vous reste dû jusqu’à l’échéance.',
  },
  {
    id: 'credits-empty',
    question: 'Mes crédits IA sont épuisés, que se passe-t-il ?',
    answer:
      'Votre agent cesse de répondre automatiquement — mais vous pouvez toujours répondre à la main, et vos automatisations continuent. Vous pouvez recharger 500 conversations pour 45 € (elles ne périment pas), ou passer à un plan supérieur.',
    page: '/subscription',
    target: 'ai-credits',
  },
  {
    id: 'promo-code',
    question: 'Où entrer un code promo ?',
    answer:
      'Le code se saisit au moment de choisir un plan, depuis l’app Xeyo dans votre admin Shopify : cliquez sur « J’ai un code promo » sous les plans. La remise s’affiche sur l’écran de confirmation Shopify avant que vous validiez.',
    page: '/subscription',
    target: 'plans-grid',
  },
  {
    id: 'invoices',
    question: 'Où trouver mes factures ?',
    answer:
      'Votre abonnement Xeyo est facturé avec votre facture Shopify : aucun moyen de paiement à saisir chez nous. Vos factures se trouvent dans votre admin Shopify, section Facturation.',
    page: '/subscription',
  },

  // ═══ PARRAINAGE ═══════════════════════════════════════════════════════════
  {
    id: 'referral',
    question: 'Comment parrainer un autre marchand ?',
    answer:
      'Dans les Paramètres, onglet « Abonnement », vous trouverez votre lien de parrainage. Dès qu’un marchand s’inscrit via ce lien et s’abonne, vous recevez un mois offert — déduit automatiquement de votre prochaine facture Shopify.',
    page: '/settings',
    target: 'referral',
    note: 'C’est l’abonnement du filleul qui déclenche la récompense, pas sa simple inscription.',
  },

  // ═══ PARAMÈTRES ═══════════════════════════════════════════════════════════
  {
    id: 'macros',
    question: 'Comment créer des réponses toutes faites ?',
    answer:
      'Dans les Paramètres, onglet « Macros ». Vous y enregistrez vos réponses fréquentes ; elles seront ensuite accessibles depuis l’icône en forme d’éclair, dans la barre de saisie d’une conversation.',
    page: '/settings',
    target: 'settings-macros',
  },
  {
    id: 'retention',
    question: 'Combien de temps mes messages sont-ils conservés ?',
    answer:
      'Vous le décidez. Dans les Paramètres, onglet « Données », la carte « Rétention des données » vous laisse choisir : indéfiniment, ou une purge automatique après 1 mois, 3 mois, 1 an… Vous pouvez aussi purger immédiatement.',
    page: '/settings',
    target: 'settings-retention',
  },
  {
    id: 'export-data',
    question: 'Comment exporter mes données (RGPD) ?',
    answer:
      'Dans les Paramètres, onglet « Données », le bouton « Exporter mes données » génère une archive contenant l’ensemble de vos contacts, conversations et messages.',
    page: '/settings',
    target: 'settings-export',
  },
  {
    id: 'theme-language',
    question: 'Comment changer le thème ou la langue ?',
    answer:
      'Dans les Paramètres, onglet « Compte », la carte « Préférences » regroupe la langue, le fuseau horaire, le thème (clair, sombre, système) et les sons de notification.',
    page: '/settings',
    target: 'settings-header',
  },

  // ═══ STATISTIQUES ═════════════════════════════════════════════════════════
  {
    id: 'stats',
    question: 'Où voir mes résultats et mes ventes WhatsApp ?',
    answer:
      'Sur la page « Statistiques ». L’onglet « Vue d’ensemble » donne l’essentiel ; « Automatisations » montre l’entonnoir de conversion (combien de messages envoyés, ouverts, ayant mené à une commande) ; « Agents » détaille les performances de chaque agent.',
    page: '/stats',
    target: 'stats-header',
  },
]

/** Le contexte que l'IA reçoit pour choisir. Généré à partir de la base. */
export function knowledgeForPrompt(): string {
  return HELP_TOPICS.map((t) => {
    const dest = t.page ? ` [page: ${t.page}${t.target ? `, élément: ${t.target}` : ''}]` : ' [aucune destination]'
    return `## ${t.id}${dest}\nQ: ${t.question}\nR: ${t.answer}${t.note ? `\nÀ préciser: ${t.note}` : ''}`
  }).join('\n\n')
}

/** Les destinations réelles — pour vérifier que l'IA n'invente pas. */
export const VALID_PAGES = new Set(HELP_TOPICS.map((t) => t.page).filter(Boolean) as string[])
export const VALID_TARGETS = new Set(HELP_TOPICS.map((t) => t.target).filter(Boolean) as string[])
