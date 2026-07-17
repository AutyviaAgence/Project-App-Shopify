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
Si le client exprime, même sans dire « STOP », qu'il ne veut plus être contacté
(« je ne veux plus de messages », « arrêtez de m'écrire », « désabonnez-moi »,
« retirez-moi de votre liste », « stop pub »…), tu DOIS appeler l'outil
« unsubscribe_contact », puis lui confirmer chaleureusement en UNE phrase qu'il ne
recevra plus rien et qu'il peut revenir quand il veut. Ne cherche pas à le
retenir, ne lui proposes rien d'autre : respecter sa demande passe avant tout.
Si tu n'es pas sûr (le client est agacé mais ne demande pas explicitement
d'arrêter), demande-lui d'abord s'il souhaite se désabonner — n'appelle pas
l'outil au hasard.`
