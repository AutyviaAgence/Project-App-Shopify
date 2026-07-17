import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Compétences de l'agent IA : catalogue produits, formatage WhatsApp.
 *
 * ── POURQUOI CE MODULE ──────────────────────────────────────────────────────
 *
 * Le prompt de l'agent était construit à DEUX endroits :
 *   - `lib/openai/process-ai-response.ts` → la production (vrais clients) ;
 *   - `api/agents/[id]/test/route.ts`     → l'onglet « Test » du dashboard.
 *
 * Le second annonçait « même logique que processAIResponse » en commentaire. Ce
 * n'était plus vrai : il avait perdu le contexte boutique, le catalogue, les
 * boutons et le carrousel. Le marchand testait donc un agent qui n'existe nulle
 * part — il voyait un mur de texte, corrigeait son prompt à l'aveugle, et la
 * production faisait autre chose.
 *
 * Deux copies d'une même intention divergent toujours. Ce module est la source
 * unique : ce qu'on ajoute ici arrive dans les deux chemins, ou dans aucun.
 */

/** Produit tel qu'affiché à l'agent ET envoyable par le handler [CAROUSEL:]. */
export type CatalogProduct = {
  handle: string
  title: string
  price: string | null
  image_url: string | null
}

/**
 * Bloc « catalogue produits » du prompt système.
 *
 * ⚠️ On lit la MÊME table que le handler qui envoie le carrousel
 * (`shopify_products`). C'est la garantie que tout handle montré à l'agent est
 * réellement envoyable : pas de handle halluciné, pas de produit annoncé qui
 * n'arrive jamais chez le client.
 *
 * Renvoie '' si la boutique n'a aucun produit synchronisé (le bloc est alors
 * simplement absent du prompt, plutôt qu'un catalogue vide qui ferait croire à
 * l'agent qu'il n'y a rien à vendre).
 */
export async function buildCatalogPrompt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prods } = await (supabase as any)
    .from('shopify_products')
    .select('handle, title, price, image_url')
    .eq('user_id', userId)
    .not('handle', 'is', null)
    .limit(60) as { data: CatalogProduct[] | null }

  if (!prods || prods.length === 0) return ''

  const lines = prods.map((p) => {
    // On DIT lesquels sont envoyables en carrousel : le handler écarte
    // silencieusement les produits sans image. Sans cette mention, l'agent
    // annonçait « voici nos 5 produits » et le client n'en recevait que 3.
    const img = p.image_url ? '' : ' [SANS PHOTO — pas de carrousel possible]'
    return `- handle:${p.handle} · ${p.title}${p.price ? ` · ${p.price}` : ''}${img}`
  })

  return `\n\n--- Catalogue produits (${prods.length}) ---
Ce sont les VRAIS produits de la boutique. Les "handle" ci-dessous sont les seuls
utilisables dans [CAROUSEL:...] — n'en invente jamais un.
${lines.join('\n')}
⚠️ Quand le client demande quels produits tu vends, ce qu'il pourrait acheter, ou
te demande de recommander/comparer : réponds par une phrase COURTE + un
[CAROUSEL:...] avec 2 à 5 produits pertinents. JAMAIS une liste numérotée en
texte : le client ne verrait ni photo, ni prix cliquable, ni lien.
Tu ne listes pas un catalogue, tu CONSEILLES : demande son besoin (niveau, budget,
usage) puis montre 2 ou 3 produits qui y répondent. 14 produits d'affilée, ça ne
se lit pas et ça ne vend pas.
--- Fin catalogue ---`
}

/**
 * Bloc « boutons + carrousel » du prompt système.
 *
 * Ces deux balises n'ont besoin d'aucune bibliothèque (contrairement aux médias)
 * : elles sont donc toujours disponibles, dans les deux chemins. L'onglet Test ne
 * les déclarait pas du tout — l'agent y ignorait leur existence, et le marchand
 * ne pouvait pas tester ce que ses clients recevraient vraiment.
 */
export const BUTTONS_AND_CAROUSEL_SKILL = `
🔘 PROPOSER DES BOUTONS, balise [BTN:Choix 1|Choix 2|Choix 3] (1 à 3 boutons, chaque libellé ≤ 20 caractères).
TU DOIS impérativement ajouter cette balise CHAQUE FOIS que tu proposes au client plusieurs options, choix, ou actions possibles, au lieu de les lister en texte.
La balise se place À LA FIN de ton message. Quand le client clique, tu reçois le libellé comme s'il l'avait tapé.
NE liste JAMAIS des options en texte (genre "1. ... 2. ...") si tu peux les mettre en boutons.

🛍️ PRÉSENTER DES PRODUITS (CARROUSEL), balise [CAROUSEL:handle1,handle2,...] (2 à 5 produits).
Le système envoie pour chaque produit sa photo + son nom, prix et lien. Utilise UNIQUEMENT des "handle" du catalogue ci-dessus (jamais inventé).
Insère cette balise dès que tu recommandes ou compares plusieurs produits, au lieu de les décrire en texte.

🔗 PARTAGER UN LIEN, balise [LINK:Libellé|https://url].

⚠️ N'écris JAMAIS de markdown : pas de **gras**, pas de ## titres, pas de tableaux.
WhatsApp ne les affiche pas — le client verrait les astérisques.`

/**
 * Markdown → formatage WhatsApp.
 *
 * ⚠️ WhatsApp n'est PAS du markdown : le gras y est *simple étoile*, pas
 * **double**. Le modèle écrit du markdown par défaut — le client recevait
 * littéralement « 1. **The Minimal Snowboard** - 885,95 € », astérisques
 * comprises. Constaté en production.
 *
 * On convertit à la SORTIE plutôt que d'espérer que le prompt suffise : aucune
 * consigne ne tient sur 100 % des réponses, et le coût d'un raté est un message
 * parti chez un vrai client.
 *
 * Vérifié : `un_nom_de_variable` et `2 * 3 * 4` ne sont pas cassés, et le gras
 * WhatsApp déjà correct n'est pas retouché.
 */
export function markdownToWhatsApp(text: string): string {
  return text
    // Ordre important : *** avant **, et ** avant * — sinon le motif court
    // consomme le début du long et laisse des étoiles orphelines.
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '*_$1_*')                     // gras+italique
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')                            // **gras** → *gras*
    .replace(/(^|[\s(])__([^_\n]+)__(?=$|[\s.,;:!?)])/gm, '$1*$2*')   // __gras__ → *gras*
    // Titres markdown (« ## Nos produits ») : WhatsApp ne les rend pas, le # resterait.
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
}
