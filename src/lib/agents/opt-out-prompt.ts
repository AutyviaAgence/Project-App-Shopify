/**
 * Consigne DÉSABONNEMENT injectée dans le prompt de tout agent créé à
 * l'onboarding (auto-configuré depuis Shopify ET généré par l'IA).
 *
 * ── POURQUOI ────────────────────────────────────────────────────────────────
 *
 * Le mot-clé « STOP » exact est déjà attrapé par le webhook. Mais un vrai client
 * n'écrit presque jamais « STOP » : il dit « je ne veux plus recevoir vos
 * messages », « arrêtez de m'écrire », « retirez-moi de la liste ». Sans cette
 * consigne, l'agent comprenait l'intention et continuait à bavarder — jusqu'à ce
 * que le client BLOQUE le numéro. Or (recherche Meta 2024-2026, sources
 * officielles) les blocages font chuter la note de qualité sur 7 jours et
 * réduisent les limites d'envoi. Un désabonnement honoré coûte infiniment moins
 * cher qu'un blocage subi.
 *
 * L'outil `unsubscribe_contact` fait le travail réel (le prompt seul ne
 * désabonne pas) ; cette consigne dit à l'agent QUAND l'appeler et comment se
 * comporter — sans jamais mentionner de code technique au client.
 */
export const OPT_OUT_PROMPT = `DÉSABONNEMENT (RÈGLE IMPORTANTE)
Appelle l'outil « unsubscribe_contact » UNIQUEMENT si le DERNIER message du client
exprime, ici et maintenant, qu'il ne veut plus être contacté (« je ne veux plus de
messages », « arrêtez de m'écrire », « désabonnez-moi », « retirez-moi de votre
liste », « stop pub »…). Puis confirme-lui en UNE phrase qu'il ne recevra plus rien
et qu'il peut revenir quand il veut. Ne cherche pas à le retenir.

⚠️ NE te fie JAMAIS à un ancien message de la conversation. Si le client a demandé
à se désabonner PLUS TÔT mais que son message ACTUEL est autre chose (« Bonjour »,
« Quels sont vos produits ? », « merci »…), NE rappelle PAS l'outil : réponds
normalement à ce qu'il dit maintenant. Un désabonnement déjà fait ne se refait pas.

En cas de doute (le client est agacé mais ne demande pas explicitement d'arrêter),
demande-lui d'abord s'il souhaite se désabonner — n'appelle jamais l'outil au
hasard.`

/**
 * Consigne TRANSFERT HUMAIN, injectée avec OPT_OUT_PROMPT sur tout agent.
 *
 * Sans elle, un client qui demandait « je veux parler à un humain » recevait une
 * réponse de l'agent qui PARLAIT de transfert (« je vais vous mettre en
 * contact ») sans rien déclencher : pas de prise en main, pas de notification, et
 * parfois une fausse balise « [boutons: …] » affichée en clair. L'outil
 * `request_human` fait le vrai travail (pause IA + alerte marchand) ; cette
 * consigne dit à l'agent quand l'appeler.
 */
export const HANDOFF_PROMPT = `TRANSFERT À UN HUMAIN (RÈGLE IMPORTANTE)
Si le client demande à parler à un humain / un conseiller (« je veux parler à
quelqu'un », « passez-moi un responsable »…), OU face à une situation que tu ne
dois pas gérer seul (litige sur un remboursement, menace légale, client très
mécontent, réclamation grave), tu DOIS appeler l'outil « request_human ». Puis
dis-lui en UNE phrase qu'un conseiller va prendre le relais. N'invente pas de
délai. N'écris JAMAIS « [boutons: …] » ni aucune balise à la main : les boutons
sont gérés par le système, pas par toi.`
