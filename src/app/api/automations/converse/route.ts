import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { canUseAiOrOnboarding } from '@/lib/plans/gate'
import { GRAPH_JSON_SCHEMA_DOC, validateGraph, buttonBranch, BUTTON_TIMEOUT_BRANCH, type WorkflowGraph } from '@/lib/automations/graph-types'
import { TRIGGER_EVENTS, triggersForKind, type TriggerEvent } from '@/lib/automations/types'

/**
 * POST /api/automations/converse
 *
 * Assistant CONVERSATIONNEL de création de workflow (funnel), calqué sur
 * /api/templates/converse. L'IA pose 2 à 4 questions courtes, s'appuie sur les
 * modèles APPROUVÉS du marchand, puis génère un GRAPHE COMPLET (plusieurs
 * messages, délais, conditions, test A/B) — pas un simple trigger→message.
 *
 * Si un message manque pour réaliser le funnel demandé, l'IA le signale au lieu
 * d'inventer : on renvoie `missingTemplates` → l'UI affiche un bouton
 * « Créer ce modèle » qui redirige vers la page Modèles.
 *
 * Entrée : { messages: {role,content}[], kind?: 'marketing'|'transactional' }
 * Sortie :
 *   - { mode:'ask', question, options? }
 *   - { mode:'ready', graph, name, trigger, usedTemplates[], missingTemplates[] }
 *   - { mode:'need_templates', missingTemplates[], message }  → rien à générer
 */
type Msg = { role: 'user' | 'assistant'; content: string }

/**
 * Au-delà, on arrête de questionner.
 *
 * Le prompt annonce « 2 à 4 questions max », mais une consigne ne borne rien :
 * testé, le modèle a posé « Quel déclencheur ? » puis, deux tours plus tard,
 * « Pour clarifier, souhaitez-vous utiliser le déclencheur Opt-in reçu ? » — il
 * redemande ce qu'il vient de demander. Seul le code peut y mettre fin.
 */
const MAX_QUESTIONS = 4

/**
 * Réponses rapides de la question d'ouverture : TOUS les déclencheurs de la
 * famille, formulés comme des OBJECTIFS.
 *
 * Deux raisons de ne pas les écrire en dur :
 *  - on n'en proposait que 3 sur 8 (marketing) ou 3 sur 7 (transactionnel) : le
 *    marchand ne voyait pas ce que l'outil sait faire, et devait le deviner ;
 *  - une liste figée diverge de `triggersForKind` au premier déclencheur ajouté.
 *
 * Les libellés bruts sont techniques (« Opt-in reçu », « Pas de réponse
 * client ») : on les reformule en intention (« Accueillir un nouvel abonné »,
 * « Réactiver un client inactif »). Un déclencheur non listé ici retombe sur son
 * libellé — jamais absent, quitte à être moins joli.
 */
const OPENING_LABELS: Partial<Record<TriggerEvent, string>> = {
  checkout_abandoned: 'Relancer les paniers abandonnés',
  contact_opted_in: 'Accueillir un nouvel abonné',
  optin_popup: 'Accueillir un abonné du site',
  scheduled_date: 'Envoyer une promo à une date',
  customer_birthday: 'Souhaiter un anniversaire',
  no_customer_reply: 'Réactiver un client inactif',
  message_read: 'Relancer après lecture',
  order_created: 'Confirmer une commande',
  order_paid: 'Confirmer un paiement',
  order_fulfilled: 'Prévenir de l’expédition',
  order_delivered: 'Message à la livraison',
  order_cancelled: 'Prévenir d’une annulation',
  refund_created: 'Confirmer un remboursement',
  return_requested: 'Accompagner un retour',
}
function openingOptions(kind: 'marketing' | 'transactional'): string[] {
  return triggersForKind(kind).map((e) => OPENING_LABELS[e.value] || e.label)
}

/**
 * Comment construire un funnel de VENTE — doctrine fondée sur la mécanique Meta.
 *
 * ── D'OÙ VIENNENT CES RÈGLES ────────────────────────────────────────────────
 *
 * D'une recherche vérifiée contradictoirement (chaque affirmation contestée par
 * 3 agents indépendants), pas de « bonnes pratiques » de blog. Résultat brut :
 * AUCUN benchmark public sur les funnels WhatsApp n'a survécu — ni les taux de
 * clic quick-reply vs lien, ni les revenus par message, ni les séquences types
 * des éditeurs. Ces chiffres sont du marketing d'éditeur.
 *
 * Ce qui tient, en revanche, ce sont les règles de la plateforme, sourcées chez
 * developers.facebook.com. Elles suffisent à fonder la structure :
 *
 * 1. UN CLIC SUR BOUTON EST UN MESSAGE ENTRANT. Il ouvre (et réarme) la fenêtre
 *    de 24 h, et les messages marketing envoyés dans cette fenêtre NE COMPTENT
 *    PAS dans le plafond marketing par utilisateur. Un clic sur un LIEN, lui, ne
 *    déclenche aucun webhook et n'ouvre rien. C'est la seule raison DOCUMENTÉE
 *    de préférer les boutons — pas une histoire de copywriting.
 *
 * 2. MOINS LU = MOINS ENVOYÉ. La qualité du numéro est notée sur le
 *    comportement du destinataire (blocages, signalements, ET faible taux de
 *    lecture) sur 7 jours glissants. Un funnel long qu'on ignore se punit tout
 *    seul, sans que personne ne bloque. D'où : peu de messages, et une sortie
 *    dès que le client a agi.
 *
 * 3. AU-DELÀ DE 24 H, C'EST TEMPLATE OBLIGATOIRE (erreur 131047 sinon), et en
 *    catégorie MARKETING — donc soumis au plafond que le point 1 permet
 *    justement de contourner.
 *
 * ── CE QU'ON NE SAIT PAS ────────────────────────────────────────────────────
 *
 * Le nombre optimal de boutons, les libellés qui convertissent, le bon délai
 * (J+1 ? J+3 ?) : aucune source fiable. On ne prétend donc rien là-dessus. Le
 * marchand a des tests A/B dans l'outil : ce sont SES chiffres qui trancheront,
 * et ils valent mieux que n'importe quel benchmark d'éditeur.
 *
 * ⚠️ La limite « 3 boutons maximum » est souvent citée mais n'a PAS été
 * confirmée par les sources : on ne l'impose pas ici.
 */
const FUNNEL_DOCTRINE_MARKETING = `- CONSTRUIS UN FUNNEL À BOUTONS, PAS UNE SUITE D'ENVOIS.
  Un message à boutons de réponse rapide (« Finaliser ma commande » / « J'ai une
  question ») vaut mieux qu'un message avec un simple lien, pour une raison
  mécanique : quand le client CLIQUE un bouton, WhatsApp le compte comme une
  réponse — cela rouvre 24 h de discussion libre et sort les messages suivants du
  plafond marketing. Un lien cliqué ne produit rien de tel.
  → Dès qu'un modèle disponible a des boutons — MÊME UN SEUL — sers-t'en et
    BRANCHE le parcours : une arête branch:"button:<libellé exact>" par bouton,
    plus la suite par défaut branch:"button:__timeout__" pour celui qui ne clique
    pas. C'est le CLIC qui rouvre la fenêtre de 24 h, pas le nombre d'options :
    un modèle à bouton unique laissé sans branche gâche exactement le même
    avantage qu'un modèle à trois boutons.

- CHAQUE BRANCHE DOIT MENER À QUELQUE CHOSE DE DIFFÉRENT.
  Un bouton qui retombe sur le même message ne sert à rien. Celui qui clique
  « J'ai une question » n'attend pas la même chose que celui qui clique
  « Finaliser ». S'il n'existe pas de modèle pour une branche, décris-le dans
  missingTemplates plutôt que de tout faire converger.

- ⚠️ N'AJOUTE PAS DE CONDITION « A-T-IL COMMANDÉ ? ». C'EST DÉJÀ AUTOMATIQUE.
  Le système annule tout seul la relance d'un panier dès que le client passe
  commande — tu n'as rien à faire, et aucun champ ne permet de l'exprimer de
  toute façon. En tenter une produit une condition absurde (du type
  « montant > 0 », qui est TOUJOURS vrai sur un panier) : elle n'a aucun effet,
  et le marchand ne comprend pas ce qu'elle fait dans son parcours.

- RESTE COURT : 3 ou 4 messages AU TOTAL, toutes branches confondues. Plus long
  n'est pas plus vendeur : chaque message ignoré abîme la réputation du numéro,
  donc la délivrabilité de TOUS les envois.
  ⚠️ Compte bien : un message par branche compte. Un rappel + une branche « Oui »
  + une branche « Non » + une relance = 4. C'est déjà le maximum. Un parcours de
  10 messages est illisible pour le marchand — il ne l'activera jamais.

- ⚠️ UN NŒUD "delay" ENTRE CHAQUE MESSAGE, SANS EXCEPTION.
  Deux "action" qui se suivent sans "delay" partent EN MÊME TEMPS : le client
  reçoit deux messages d'affilée, les ignore, et le faible taux de lecture
  dégrade la réputation du numéro — donc la délivrabilité de TOUS tes envois.
  Utilise ces valeurs de "minutes" : 0, 30, 60, 180, 1440 (1 j), 2880 (2 j),
  10080 (7 j). Rien d'autre — une valeur exotique s'affiche mal chez le marchand.

- LE DÉLAI EST UN CHOIX DU MARCHAND, PAS UNE VÉRITÉ.
  Aucune donnée publique fiable ne dit si J+1 bat J+3. Propose un espacement
  raisonnable (1440 = 24 h), dis que c'est ajustable, et n'invente pas de
  justification chiffrée. Un test A/B lui donnera SA réponse.

- ⚠️ CHAQUE NŒUD DOIT SE JUSTIFIER. PAS DE DÉCORATION.
  Un test A/B ou une condition qu'on ajoute « parce que ça fait pro » nuit : il
  complique le parcours, dilue les envois sur deux variantes, et n'apprend rien.

  TEST A/B — n'en mets un QUE si tu peux nommer l'HYPOTHÈSE testée et que les
  variantes s'opposent vraiment (ex. « avec code promo » CONTRE « sans code
  promo, réassurance seule » : on saura si la remise est nécessaire). Deux
  formulations du même message ne sont pas une hypothèse. Dans le doute : PAS de
  test A/B — le marchand pourra en ajouter un quand il aura une question précise.

  CONDITION — n'en mets une QUE si les deux branches mènent à des suites
  DIFFÉRENTES. « A-t-il commandé ? » est utile : oui → on arrête, non → on
  relance. Une condition dont les deux sorties font la même chose est du bruit.

  Explique en une phrase, dans "explanation", à quoi sert chaque test A/B ou
  condition que tu as posé. Si tu n'y arrives pas, c'est qu'il ne sert à rien :
  retire-le.`

const FUNNEL_DOCTRINE_TRANSACTIONAL = `- Un funnel transactionnel est COURT et informatif (1 à 2 messages) : il informe,
  il ne vend pas.
- ⚠️ Même court, tu SOUMETS ta recommandation avant de générer : « Je propose un
  message dès l'expédition, avec un bouton "Suivre mon colis". Ça vous va ? ».
  Un seul message ne dispense pas de faire valider — le marchand doit garder la
  main sur ce que ses clients reçoivent.
- Un bouton de réponse rapide reste utile s'il rend service (« Suivre mon colis »,
  « J'ai un problème ») : un clic rouvre 24 h de discussion libre, ce qui permet
  au client de poser sa question et à l'agent IA de répondre. Branche alors les
  sorties (branch:"button:<libellé>" + branch:"button:__timeout__").
- Aucune promotion ici (ni code promo, ni offre) : Meta reclasserait le modèle en
  MARKETING, ce qui coûte plus cher et fait perdre la gratuité dans la fenêtre.`

/**
 * Messages de l'assistant qui NE SONT PAS des questions, et ne doivent donc pas
 * compter dans le plafond : « il manque des modèles », « je n'ai pas compris ».
 * Le plafond existe pour arrêter un interrogatoire — pas pour punir un marchand
 * qui suit les étapes qu'on lui a demandées.
 */
const ASSISTANT_NON_QUESTION = /Aucun de vos modèles|Il faut d’abord créer|Créez d’abord|Je n’ai pas réussi/i

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAiOrOnboarding(user.id)
  if (!gate.allowed) {
    return NextResponse.json({ error: 'L’assistant IA de création de workflow nécessite un plan payant.', upgrade: true }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    messages?: Msg[]
    kind?: 'marketing' | 'transactional'
    createdTemplateIds?: string[]
  }
  const messages = (body.messages || []).filter((m) => m && m.content?.trim()).slice(-20)
  const kind: 'marketing' | 'transactional' = body.kind === 'transactional' ? 'transactional' : 'marketing'

  // ⚠️ Les modèles que le marchand VIENT de créer depuis ce chat.
  //
  // Sans eux, la boucle était sans issue : l'IA répondait « need_templates », le
  // marchand créait les messages, cliquait « Construire le parcours »… et l'IA
  // répondait « Aucun de vos modèles ne correspond » — indéfiniment.
  //
  // Le catalogue est pourtant relu à chaque appel, brouillons compris : les
  // modèles ÉTAIENT là. Mais sous des noms générés (`message_bienveillant_k3f9`),
  // noyés parmi 60 autres, rien ne les reliait aux briefs qu'elle venait
  // d'écrire. Une phrase (« je les ai créés ») ne prouve rien : elle refaisait le
  // même jugement et retombait sur la même conclusion.
  //
  // On passe donc les IDs, pas une affirmation — et on les lui désigne nommément
  // plus bas. C'est vérifiable, elle ne peut plus les rater.
  const createdIds = (body.createdTemplateIds || []).filter((v) => typeof v === 'string').slice(0, 8)

  // Modèles utilisables pour CONSTRUIRE : approuvés, en revue, et brouillons.
  //
  // On ne se limite plus aux approuvés. Un brouillon (créé à la main ou par
  // l'assistant) est parfaitement constructible : le parcours reste inactivable
  // tant que Meta n'a pas validé, et chaque nœud le dit. L'exclure obligeait à
  // attendre ~24 h de revue avant même de pouvoir dessiner son parcours — ou
  // poussait l'IA à décrire un message « manquant » qui existait déjà.
  //
  // `use_case` est indispensable : sans lui, l'IA ne voit qu'un nom et un bout de
  // texte, et place un modèle de bienvenue sur « Commande payée » (constaté).
  const { data: tpls } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, body_text, buttons, status, category, use_case')
    .eq('user_id', user.id)
    .in('status', ['approved', 'pending', 'draft'])
    .limit(60)
  const templates = (tpls || []) as {
    id: string; name: string; language: string; body_text: string | null
    buttons: unknown; category: string | null; status: string; use_case: string | null
  }[]

  // Dédup par nom (les variantes linguistiques partagent le même name).
  //
  // ⚠️ QUELLE LANGUE GAGNE N'ÉTAIT PAS DÉCIDÉ — ET ÇA CASSAIT TOUT.
  //
  // La requête n'a pas d'ORDER BY : c'est donc la ligne que Postgres renvoie en
  // premier qui gagnait, EN ou FR, au hasard. Or `createdTemplateIds` porte les
  // id des modèles FR (ceux que /from-suggestion vient de créer ; la traduction
  // anglaise est faite après, avec d'autres id). Quand l'anglais gagnait, l'id FR
  // n'était PAS dans le catalogue — alors que le prompt exige « n'utilise QUE ces
  // id ». On désignait donc à l'IA des modèles absents de la liste autorisée :
  // elle suivait la liste, laissait les nœuds vides, et le parcours arrivait sans
  // aucun message rattaché. Le marchand cliquait « Créer ce parcours » et voyait
  // ses 3 messages redemandés.
  //
  // On tranche : le FR d'abord (langue de construction), et surtout JAMAIS un
  // modèle qu'on vient de créer ne peut être masqué par sa traduction.
  const createdSet = new Set(createdIds)
  const byName = new Map<string, typeof templates[number]>()
  for (const t of templates) {
    const cur = byName.get(t.name)
    if (!cur) { byName.set(t.name, t); continue }
    // Priorité : modèle fraîchement créé > français > premier venu.
    const better = createdSet.has(t.id) ? 2 : t.language === 'fr' ? 1 : 0
    const currentScore = createdSet.has(cur.id) ? 2 : cur.language === 'fr' ? 1 : 0
    if (better > currentScore) byName.set(t.name, t)
  }
  // Ce que l'IA doit voir pour JUGER si un modèle convient :
  //  - l'USAGE (use_case) : « bienvenue » vs « états de commande ». Sans lui, elle
  //    n'a qu'un nom à interpréter, et met un message de bienvenue sur une
  //    commande payée (constaté en production).
  //  - le STATUT : un brouillon est utilisable, mais bloque l'activation — elle
  //    doit pouvoir préférer un approuvé à statut égal de pertinence.
  //  - un extrait de texte assez long pour reconnaître l'intention (110
  //    caractères coupaient souvent avant le sujet réel du message).
  const USE_CASE_FR: Record<string, string> = {
    order_status: 'états de commande (confirmation, expédition, livraison)',
    cart: 'panier / relance',
    marketing: 'marketing / promotions',
    support: 'support, bienvenue, avis',
    billing: 'paiement / facturation',
  }
  const tplCatalog = Array.from(byName.values()).map((t) => {
    const qr = Array.isArray(t.buttons)
      ? (t.buttons as { type?: string; text?: string }[]).filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text).filter(Boolean)
      : []
    const body = (t.body_text || '').replace(/\s+/g, ' ').slice(0, 180)
    const usage = t.use_case ? USE_CASE_FR[t.use_case] || t.use_case : 'usage non précisé'
    const statut = t.status === 'approved' ? 'approuvé'
      : t.status === 'pending' ? 'EN REVUE Meta'
      : 'BROUILLON (non soumis)'
    return `- id:"${t.id}" · ${t.name} · usage: ${usage} · ${statut} · [${t.category || 'UTILITY'}]`
      + `${qr.length ? ` · boutons: ${qr.join(', ')}` : ' · aucun bouton'}`
      + `\n    texte: « ${body} »`
  }).join('\n') || '(aucun modèle pour le moment)'

  // Les modèles tout juste créés, DÉSIGNÉS NOMMÉMENT.
  //
  // Ils sont déjà dans le catalogue ci-dessus — mais noyés. Ici on les ressort et
  // on lève l'ambiguïté : ce sont EXACTEMENT les messages qu'elle a demandés au
  // tour d'avant. Sans ce rappel, elle ne pouvait pas faire le lien entre son
  // brief (« message de bienvenue avec 2 boutons ») et un `message_bienveillant_k3f9`
  // apparu dans la liste. On borne par user_id : un ID envoyé par le client ne
  // doit jamais donner accès au modèle d'un autre marchand.
  let justCreated = ''
  if (createdIds.length > 0) {
    const fresh = templates.filter((t) => createdIds.includes(t.id))
    if (fresh.length > 0) {
      justCreated = `

# ✅ LES MODÈLES QUE TU AS DEMANDÉS VIENNENT D'ÊTRE CRÉÉS

Le marchand a créé ces modèles À L'INSTANT, à partir de TES propres descriptions,
pour CE parcours précis :

${fresh.map((t) => {
  const qr = Array.isArray(t.buttons)
    ? (t.buttons as { type?: string; text?: string }[]).filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text).filter(Boolean)
    : []
  return `- id:"${t.id}" · ${t.name}`
    + `${qr.length ? ` · boutons: ${qr.join(', ')}` : ' · aucun bouton'}`
    + `\n    texte: « ${(t.body_text || '').replace(/\s+/g, ' ').slice(0, 180)} »`
}).join('\n')}

INTERDIT de répondre "need_templates" pour ces messages-là : ils EXISTENT, leurs
id sont ci-dessus. Tu construis le parcours MAINTENANT, en mode "ready", en
utilisant ces id dans les nœuds "action".
Leur statut brouillon n'est PAS un obstacle : le parcours se dessine, il sera
simplement inactivable tant que Meta n'a pas validé — c'est prévu et affiché.
Si un message manque ENCORE (autre que ceux-ci), construis quand même le parcours
complet et signale-le dans "missingTemplates" du mode "ready".`
    }
  }

  // Catalogue des déclencheurs : le LIBELLÉ humain est ce que l'IA doit montrer
  // au marchand ; le code technique ne sert QU'À remplir le champ "event" du
  // graphe (jamais affiché). Sans cette distinction, l'IA proposait des options
  // illisibles du type « contact_opted_in ».
  const triggerList = triggersForKind(kind)
    .map((e) => `- « ${e.label} » → event:"${e.value}" (${e.description})`)
    .join('\n')
  const kindLabel = kind === 'marketing' ? 'CAMPAGNE MARKETING' : 'AUTOMATISATION TRANSACTIONNELLE'

  const system = `Tu es un expert en funnels WhatsApp pour l'e-commerce. Tu aides un marchand à construire une ${kindLabel} complète.

Tu parles à un COMMERÇANT, pas à un développeur.
RÈGLE ABSOLUE : dans "question" et "options", n'écris JAMAIS de code technique
(pas de "contact_opted_in", "scheduled_date", "order_paid"…). Utilise UNIQUEMENT
des formulations humaines, en français courant. Les codes techniques ne servent
QUE dans le champ "event" du graphe JSON, jamais à l'écran.
  ✅ bon  : options: ["Quand un client abandonne son panier", "Quand quelqu'un s'abonne", "À une date précise"]
  ❌ interdit : options: ["checkout_abandoned", "contact_opted_in", "scheduled_date"]

# ⚠️ TU RECOMMANDES, TU N'INTERROGES PAS

Tu es un EXPERT qui conseille, pas un formulaire. La différence tient dans la
formulation :

  ❌ « Combien de messages souhaitez-vous ? »
     → le marchand n'en sait rien, c'est TOI l'expert. Il doit deviner ce que tu
       attends, et il n'apprend rien.

  ✅ « Je propose 2 messages : un rappel 1 h après l'abandon, puis une relance
       avec code promo le lendemain. On part là-dessus ? »
     → tu as décidé, tu expliques pourquoi, il valide ou ajuste d'un mot.

Chaque question DOIT donc porter ta recommandation. Tu proposes une option
précise et tu demandes confirmation — jamais une question ouverte qui renvoie la
décision au marchand.

# COMBIEN DE QUESTIONS

⚠️ D'ABORD SON OBJECTIF, ENSUITE TA RECOMMANDATION. JAMAIS L'INVERSE.

Tant que le marchand n'a pas dit CE QU'IL VEUT FAIRE, tu n'as rien à recommander :
tu ne connais ni son besoin, ni sa boutique. Ouvrir sur « Je propose 2 messages
pour relancer les paniers abandonnés » alors qu'il n'a rien demandé, c'est décider
à sa place — il voulait peut-être accueillir ses abonnés.

  1er message (il n'a encore rien dit) → « Que souhaitez-vous mettre en place ? »,
      avec des options concrètes : ["Relancer les paniers abandonnés",
      "Accueillir un nouvel abonné", "Envoyer une promo"].
  ENSUITE, une fois son objectif connu → ta recommandation à valider.

⚠️ TU SOUMETS TOUJOURS TA RECOMMANDATION AVANT DE GÉNÉRER — une question, la
tienne : « voici le parcours que je propose […]. Ça vous va ? ». Générer sans rien
demander prive le marchand de toute prise : il découvre un parcours tout fait,
sans avoir pu peser sur le nombre de messages, le rythme ou l'offre.
C'est vrai MÊME pour un parcours d'un seul message : annonce-le et fais valider.

Deux questions si un choix vraiment structurant reste ouvert. JAMAIS plus de 3.

SEULE EXCEPTION — zéro question : le marchand a DÉJÀ décrit sa structure (« un
message avec 1 bouton code promo, puis s'il clique il reçoit le code »). Là tu as
tout, et lui redemander serait le faire répéter. Construis directement.

Utilise "options" pour proposer 2-3 réponses rapides et concrètes :
  question: « Je propose 2 messages : rappel à 1 h, puis code promo à 24 h. Ça vous va ? »
  options: ["Parfait", "Plutôt 3 messages", "Sans code promo"]

⚠️ NE REDEMANDE JAMAIS CE QUI EST DÉJÀ DIT. Relis toute la conversation avant
chaque question. Si le marchand a décrit sa structure (« un message avec 1 bouton
code promo, puis s'il clique il reçoit le code »), tu as TOUT : construis
directement, sans rien demander. Lui faire répéter ce qu'il vient d'écrire est le
meilleur moyen de lui faire fermer l'assistant.

# CE QUE TU DÉCIDES, PUIS SOUMETS

Tu ne demandes pas ces valeurs « à blanc » : tu les CHOISIS, tu les annonces dans
ta recommandation, et il corrige s'il veut.
 - nombre de messages → 2 par défaut (ou ce que la demande implique) ;
 - espacement → 1440 (24 h), ou 0 si la demande dit « immédiat » ;
 - structure → déduite de la demande.

⚠️ NE DEMANDE PAS « voulez-vous un test A/B ? ». C'est une question d'expert posée à
quelqu'un qui veut juste vendre : il répondra oui par réflexe, et tu produiras un test
qui ne teste rien. Un A/B ne se propose que si TU as une hypothèse à défendre (voir
plus bas) — et dans ce cas tu l'expliques, tu ne la demandes pas.

# ⚠️ NE DEMANDE PAS LE DÉCLENCHEUR SI L'OBJECTIF LE DIT DÉJÀ

C'est l'erreur la plus fréquente, et elle exaspère : le marchand vient d'écrire
« relancer les paniers abandonnés », et on lui demande « quel déclencheur ? ».
Il l'a DÉJÀ dit. DÉDUIS-le, ne le fais pas répéter.

Correspondances évidentes — applique-les sans poser de question :
 - « panier abandonné », « pas fini leur commande », « panier oublié » → checkout_abandoned
 - « nouvel abonné », « bienvenue », « quelqu'un s'abonne » → contact_opted_in
 - « anniversaire » → customer_birthday
 - « à telle date », « samedi », « lundi matin », « le 12 » → scheduled_date
 - « client inactif », « qui n'achète plus », « qui ne répond plus », « réveiller », « réactiver »
   → no_customer_reply (⚠️ SURTOUT PAS contact_opted_in : un client inactif n'est pas
     quelqu'un qui vient de s'abonner — ce serait un contresens)
 - « clique sur un bouton » → PAS un déclencheur : mets le message à boutons dans
   le parcours et branche ses sorties (branch:"button:<libellé>"). C'est mieux —
   on garde le contexte (quel message, quelle étape), là où un déclencheur global
   réagirait à n'importe quel clic.
 - « a lu le message » → message_read

Ne demande le déclencheur QUE si l'objectif reste réellement ambigu après lecture.
Et si tu l'as demandé une fois, NE LE REDEMANDE JAMAIS sous un autre angle : tranche
avec la correspondance la plus proche et avance.

DÉCLENCHEURS AUTORISÉS — la liste est EXHAUSTIVE pour cette ${kindLabel}.
N'utilise AUCUN autre code dans "event", même s'il existe ailleurs dans l'app : un
déclencheur hors de cette liste est rejeté, et le marchand se retrouve avec un
parcours sans déclencheur. Si aucun ne colle vraiment, prends le plus proche de
son objectif parmi ceux-ci — jamais un inventé.
(Montre le LIBELLÉ au marchand, mets le code dans event.)
${triggerList}

MODÈLES DISPONIBLES (n'utilise QUE ces id dans templateId) :
${tplCatalog}

# ⚠️⚠️ LE MARCHAND DEMANDE DES BOUTONS → LE MODÈLE DOIT EN AVOIR. SANS EXCEPTION.

C'est l'erreur la plus coûteuse, et elle est arrivée plusieurs fois.

Quand il écrit « un message de relance avec 2 boutons », il décrit la STRUCTURE de
son parcours : ces boutons portent les branches. Un modèle sans bouton de réponse
rapide ne peut PAS être branché — le parcours s'arrête à ce message, et tout ce
qu'il a demandé derrière (test A/B, code promo, carrousel) disparaît.

Le catalogue indique pour chaque modèle « boutons: … » ou « aucun bouton ».
LIS-LE. Un modèle marqué « aucun bouton », ou qui n'a que des liens, NE PEUT PAS
servir de point de branchement.

  ❌ prendre « relancer_avec_urgence » (aucun bouton) parce que le texte colle
  ✅ templateId:null + décrire dans missingTemplates : « message de relance avec
     les boutons "Code promo" et "Visiter la boutique" »

Un message à créer se règle en un clic. Un modèle sans bouton casse tout le
funnel — et le marchand ne comprend pas pourquoi son parcours s'arrête là.

# ⚠️ UN MODÈLE QUI NE CORRESPOND PAS NE DOIT PAS ÊTRE UTILISÉ

Lis l'USAGE et le TEXTE de chaque modèle, pas seulement son nom. Un modèle de
bienvenue placé sur « Commande payée » n'a aucun sens : le client recevrait
« Bienvenue ! » après avoir payé. C'est arrivé — ne le refais pas.

Pour CHAQUE message du parcours, demande-toi : « ce texte a-t-il un sens à CE
moment précis, pour un client qui vient de vivre CET événement ? »
 - OUI → utilise son id.
 - NON, ou tu hésites → templateId:null + décris le message à créer dans
   missingTemplates. Le marchand le créera en un clic depuis ta suggestion.

⚠️ NE CASE JAMAIS un modèle « à peu près » pour éviter un trou dans le parcours.
Un message hors sujet est PIRE qu'un message à écrire : il part à de vrais
clients, il ne convertit pas, et il abîme la réputation du numéro. Le trou, lui,
se comble en un clic.

⚠️ CHAQUE ÉTAPE DOIT DIRE QUELQUE CHOSE DE NOUVEAU.
N'utilise JAMAIS deux fois le même modèle. Et surtout, n'enchaîne pas deux
modèles qui DISENT LA MÊME CHOSE, même s'ils portent des noms différents : deux
messages de bienvenue à la suite (« message_bienvenue » puis « welcome ») font
recevoir deux fois le même propos au client. C'est arrivé — compare les TEXTES,
pas les noms. Si le second n'apporte rien de plus, décris un message à créer.

# BROUILLONS ET MODÈLES EN REVUE

Tu peux t'en servir : le parcours se construit, il ne pourra simplement pas être
activé tant que Meta n'a pas approuvé (l'interface le signale sur chaque nœud).
À pertinence ÉGALE, préfère un modèle « approuvé » — il est activable tout de
suite. Mais un brouillon PERTINENT vaut toujours mieux qu'un approuvé hors sujet.

${GRAPH_JSON_SCHEMA_DOC}

CONSIGNES IMPORTANTES :
${kind === 'marketing' ? FUNNEL_DOCTRINE_MARKETING : FUNNEL_DOCTRINE_TRANSACTIONAL}
- N'INVENTE JAMAIS un templateId : utilise uniquement les id listés ci-dessus.
- S'il MANQUE un message pour réaliser le funnel (ex. pas de modèle de relance promo), NE l'invente pas.
  Mets alors templateId:null sur ce nœud ET décris-le dans "missingTemplates" :
    { "purpose": "à quoi sert ce message dans le parcours (1 phrase claire)",
      "suggestion": "CONSEILS CONCRETS POUR CONVERTIR : angle à adopter, incitation
                     (code promo, livraison offerte, urgence), LES BOUTONS DE RÉPONSE
                     RAPIDE EXACTS à mettre, et un exemple de formulation courte." }
  ⚠️ DÉCRIS **TOUS** LES MESSAGES MANQUANTS — Y COMPRIS LES CARROUSELS.
  Un carrousel de produits est un MESSAGE comme un autre : s'il n'existe pas dans
  le catalogue, il va dans missingTemplates avec les autres. Constaté : sur un
  parcours « A/B : carrousel contre code promo », l'IA décrivait le message
  d'ouverture et celui du site… mais oubliait le carrousel. Le marchand se
  retrouvait avec une variante A vide, sans savoir quoi y mettre.
  Écris alors : purpose « Carrousel de produits », suggestion « Un carrousel
  présentant 3 à 5 produits de la boutique, avec image, titre et lien ».
  COMPTE tes nœuds sans modèle : il doit y avoir AUTANT d'entrées dans
  missingTemplates que de nœuds à remplir.

  ⚠️ INDIQUE LES BOUTONS quand le parcours CONTINUE après ce message.
  Le marchand crée le message directement depuis ta suggestion : un message décrit
  sans bouton devient un message sans bouton, donc un parcours qu'on ne peut plus
  brancher — et qui perd la réouverture de fenêtre 24 h.

  MAIS pour le DERNIER message d'une branche (celui qui donne au client ce qu'il
  demandait : son code promo, sa réponse), ne demande PAS de boutons « au cas
  où ». Le parcours s'arrête là : ces boutons ne mèneraient nulle part, et le
  client voit une liste d'options mortes. Un message final se termine par une
  phrase, pas par un menu.
  Sois précis et actionnable.
- Si aucun modèle approuvé ne permet de démarrer, renvoie mode "need_templates".

# NE REPOSE JAMAIS DEUX FOIS LA MÊME QUESTION

Si le marchand répond à côté, évasivement (« je sais pas », « peu importe », « oui »)
ou ne tranche pas, tu ne reformules PAS : tu DÉCIDES à sa place et tu avances.
Reposer la question sous un autre angle le bloque en boucle — il n'obtient jamais
son parcours, c'est le pire échec possible.

Défauts à appliquer quand la réponse ne vient pas :
 - rythme non précisé → ${kind === 'marketing' ? '2 messages espacés de 24 h' : '1 message immédiat'}
 - A/B non demandé → pas de test A/B (garde le parcours simple)
 - déclencheur indécis → la correspondance la plus proche de l'objectif énoncé

Après 4 questions au total, tu passes en "ready" QUOI QU'IL ARRIVE, avec ces défauts.
Un parcours imparfait, que le marchand pourra ajuster dans l'éditeur, vaut infiniment
mieux qu'un interrogatoire sans fin.

Réponds UNIQUEMENT en JSON :
- Question : { "mode":"ask", "question":"...", "options":["...","..."] }   (options facultatives, 2-4)
- Prêt     : { "mode":"ready", "name":"nom du parcours", "graph":{ "nodes":[...], "edges":[...] },
              "explanation":"1-2 phrases décrivant le parcours créé",
              "missingTemplates":[{"purpose":"à quoi il sert","suggestion":"contenu suggéré"}] }
- Manque   : { "mode":"need_templates", "message":"...", "missingTemplates":[{"purpose":"...","suggestion":"..."}] }
⚠️ TOUT PREMIER MESSAGE (le marchand n'a encore RIEN dit) : demande-lui son
objectif. Ne recommande RIEN à ce stade — tu ne sais pas encore ce qu'il veut.
  question: « Que souhaitez-vous mettre en place ? »
  options: ${JSON.stringify(openingOptions(kind))}${justCreated}`

  // ⚠️ PLAFOND DUR. Passé 4 questions, on n'en pose plus : on EXIGE le parcours.
  //
  // Contrairement aux templates, on ne peut pas « forcer ready » côté serveur — il
  // faut un graphe, que seule l'IA produit. On lui coupe donc l'option de
  // questionner : une consigne finale, en dernier message, qu'elle ne peut pas
  // contourner en reformulant.
  //
  // ⚠️ On ne compte QUE les questions. Avant, on comptait tous les messages
  // assistant — or « il faut d'abord créer ces messages » n'est pas une question :
  // c'est une étape du parcours. Trois créations de modèles suffisaient à crever
  // le plafond, et le « STOP, ne pose plus de questions » tombait au pire moment :
  // pile quand le marchand venait de créer ses messages et demandait le parcours.
  // Le bouton « Construire le parcours » alimentait ainsi le compteur qui le
  // condamnait.
  const asked = messages.filter((m) => m.role === 'assistant' && !ASSISTANT_NON_QUESTION.test(m.content)).length
  // Les modèles viennent d'être créés : on veut un GRAPHE, pas une question de
  // plus. C'est exactement le tour où forcer sert à quelque chose.
  const forceReady = asked >= MAX_QUESTIONS || createdIds.length > 0

  const chatMessages = [
    { role: 'system' as const, content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    ...(forceReady
      ? [{
          role: 'user' as const,
          content: createdIds.length > 0
            // Les modèles demandés existent : "need_templates" n'est plus une
            // sortie légitime, c'est la boucle qu'on vient de casser. Le mode est
            // retiré de ses options — un rappel suffisait à peine, l'interdire est
            // sans ambiguïté.
            ? 'Les modèles que tu m’as demandés sont créés (leurs id sont dans le prompt système). ' +
              'Réponds OBLIGATOIREMENT en mode "ready" avec le graphe complet, en utilisant ces id. ' +
              'Les modes "need_templates" et "ask" sont INTERDITS pour ce tour. ' +
              'S’il manque encore autre chose, construis quand même le parcours et signale-le dans "missingTemplates".'
            : 'STOP — tu as posé assez de questions. Ne pose PLUS AUCUNE question : ' +
              'génère maintenant le parcours avec ce que tu sais, en appliquant les défauts ' +
              '(déclencheur le plus proche de mon objectif, 2 messages espacés de 24 h, pas de test A/B). ' +
              'Réponds en mode "ready" avec un graphe complet, ou "need_templates" s’il manque vraiment un modèle.',
        }]
      : []),
  ]
  if (forceReady) console.warn(`[automations/converse] ${asked} questions posées → génération forcée`)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 3, timeout: 60_000 })
  const started = Date.now()
  let decision: {
    mode?: 'ask' | 'ready' | 'need_templates'
    question?: string
    options?: string[]
    name?: string
    graph?: WorkflowGraph
    explanation?: string
    message?: string
    missingTemplates?: { purpose: string; suggestion: string }[]
  }
  try {
    const res = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o',           // graphe structuré → modèle plus fiable que mini
      messages: chatMessages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })
    void logAiUsage({
      feature: 'campaign', model: res.model || 'gpt-4o',
      promptTokens: res.usage?.prompt_tokens || 0, completionTokens: res.usage?.completion_tokens || 0,
      latencyMs: Date.now() - started, userId: user.id,
    })
    decision = JSON.parse(res.choices[0]?.message?.content || '{}')
  } catch {
    return NextResponse.json({ error: 'Échec de l’assistant. Réessayez.' }, { status: 502 })
  }

  // Les modèles existent mais l'IA n'a toujours pas produit de graphe : le prompt
  // le lui interdisait, elle est passée outre. Un prompt n'est jamais une garantie
  // — on lui redemande UNE fois, sans détour. Une seule : deux échecs de suite
  // signalent un vrai blocage, et boucler coûterait au marchand sans rien changer.
  if (createdIds.length > 0 && (decision.mode !== 'ready' || !decision.graph)) {
    console.warn('[automations/converse] modèles créés mais pas de graphe → seconde tentative')
    try {
      const retry = await openai.chat.completions.create({
        store: false,
        model: 'gpt-4o',
        messages: [
          ...chatMessages,
          { role: 'assistant' as const, content: JSON.stringify(decision) },
          {
            role: 'user' as const,
            content:
              'Ce n’est pas ce qui était demandé. Les modèles existent, leurs id sont dans le prompt système. '
              + 'Renvoie UNIQUEMENT { "mode":"ready", "name":..., "graph":{ "nodes":[...], "edges":[...] }, "explanation":... } '
              + 'avec ces id dans les nœuds "action". Aucun autre mode n’est accepté.',
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      })
      void logAiUsage({
        feature: 'campaign', model: retry.model || 'gpt-4o',
        promptTokens: retry.usage?.prompt_tokens || 0, completionTokens: retry.usage?.completion_tokens || 0,
        latencyMs: Date.now() - started, userId: user.id,
      })
      const second = JSON.parse(retry.choices[0]?.message?.content || '{}')
      if (second?.mode === 'ready' && second.graph) decision = second
    } catch {
      // On garde la première réponse : les garde-fous en aval la rattraperont.
    }
  }

  // `nodeId` est ajouté PAR NOUS plus bas (l'IA ne connaît pas les nœuds) : il
  // dit à l'UI où brancher le message une fois créé.
  const missing: { purpose: string; suggestion: string; nodeId?: string }[] =
    Array.isArray(decision.missingTemplates)
      ? decision.missingTemplates.filter((m) => m?.purpose).slice(0, 4)
      : []

  // Manque de modèles pour construire quoi que ce soit.
  //
  // Jamais quand le marchand vient d'en créer : il a fait ce qu'on lui demandait,
  // lui redemander la même chose est l'impasse qu'on ferme ici. Si l'IA insiste
  // malgré l'interdiction du prompt (elle en est capable), on ignore sa réponse et
  // on lui redemande un graphe — un prompt n'est pas une garantie, ce garde-fou si.
  if (decision.mode === 'need_templates' && createdIds.length === 0) {
    return NextResponse.json({
      mode: 'need_templates',
      message: decision.message || 'Il faut d’abord créer un modèle de message pour ce parcours.',
      missingTemplates: missing,
    })
  }

  // Question suivante. Filet de sécurité : si l'IA renvoie malgré tout un code
  // technique en option (« contact_opted_in »), on le traduit par son libellé
  // humain ; à défaut on l'écarte (jamais de jargon affiché au marchand).
  // Le tour forcé n'a RIEN produit d'exploitable → on ne repart pas pour un tour
  // de questions : on le dit franchement et on renvoie vers l'éditeur manuel.
  // Boucler serait pire que d'admettre l'échec.
  if (forceReady && (decision.mode !== 'ready' || !decision.graph)) {
    console.warn('[automations/converse] génération forcée sans graphe exploitable')
    return NextResponse.json({
      mode: 'need_templates',
      // Les modèles sont créés (et la seconde tentative a échoué) : lui montrer
      // encore des messages « à créer » serait absurde — il les a sous les yeux
      // dans Modèles. On l'oriente vers l'éditeur, où son travail l'attend.
      message: createdIds.length > 0
        ? 'Vos messages sont bien créés, mais je n’arrive pas à assembler le parcours. Ouvrez l’éditeur : '
          + 'vos messages y sont disponibles, il ne reste qu’à les enchaîner.'
        : 'Je n’ai pas réussi à cerner votre parcours. Décrivez-le en une phrase (ex. « relancer les paniers abandonnés avec 2 messages »), '
          + 'ou construisez-le directement dans l’éditeur — c’est souvent plus rapide.',
      missingTemplates: createdIds.length > 0 ? [] : missing,
    })
  }

  if (decision.mode !== 'ready' || !decision.graph) {
    const labelByEvent = new Map(TRIGGER_EVENTS.map((e) => [e.value as string, e.label]))
    const humanOptions = (Array.isArray(decision.options) ? decision.options : [])
      .map((o) => {
        const s = String(o || '').trim()
        if (labelByEvent.has(s)) return labelByEvent.get(s)!         // code connu → libellé
        if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s)) return null     // snake_case inconnu → jeter
        return s
      })
      .filter((o): o is string => !!o)
      // ⚠️ La QUESTION D'OUVERTURE montre TOUT ce que l'outil sait faire.
      //
      // Le plafond de 4 valait pour toutes les questions. À l'ouverture, il
      // cachait 4 déclencheurs sur 8 : le marchand ne voyait pas la moitié des
      // parcours possibles, et devait deviner qu'ils existaient.
      //
      // Les questions SUIVANTES gardent le plafond : une recommandation à
      // valider (« ça vous va ? ») avec 8 réponses rapides serait illisible —
      // là, 3 ou 4 options suffisent.
      .slice(0, asked === 0 ? 10 : 4)
    return NextResponse.json({
      mode: 'ask',
      question: decision.question || 'Quel parcours souhaitez-vous créer ?',
      options: humanOptions.length > 0 ? humanOptions : undefined,
    })
  }

  // Prêt : on VALIDE le graphe produit par l'IA (elle peut halluciner un id ou
  // oublier une branche) avant de le renvoyer à l'UI.
  const graph = decision.graph
  const validIds = new Set(templates.map((t) => t.id))
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  // Un templateId inconnu = hallucination → on le neutralise (l'UI demandera au
  // marchand de choisir le modèle sur ce nœud).
  let hallucinated = 0
  for (const n of nodes) {
    if (n.type !== 'action') continue
    // ⚠️ Le modèle renvoie parfois la CHAÎNE "null" (ou "") au lieu du littéral
    // null pour dire « message à créer ». Sans ce filtre, on la comptait comme un
    // id halluciné : le compteur remonté à l'UI était donc faux, alors que l'IA
    // avait fait ce qu'on lui demandait.
    const raw = n.templateId as string | null
    if (raw === 'null' || raw === '') { n.templateId = null; continue }
    if (raw && !validIds.has(raw)) {
      n.templateId = null
      hallucinated++
    }
  }

  // ⚠️ MODÈLE SANS BOUTON LÀ OÙ LE PARCOURS SE BRANCHE → ON LE VIDE.
  //
  // Signalé plusieurs fois : le marchand demande « un message avec 2 boutons »,
  // l'IA prend un modèle EXISTANT dont le texte colle… mais qui n'a aucun bouton
  // de réponse rapide (juste un lien, ou rien). Le webhook ne capte que les
  // quick-reply : sans eux, aucune branche ne peut partir de ce message. Le
  // parcours s'arrête là, et tout ce qui était demandé derrière (test A/B, code
  // promo, carrousel) n'existe jamais.
  //
  // On vide donc le nœud : il devient « message à créer », avec les boutons
  // décrits. Un message à écrire se règle en un clic ; un funnel amputé, non.
  let unbranchable = 0
  if (Array.isArray(graph.edges)) {
    const qrCountOf = (templateId: string | null): number => {
      if (!templateId) return 0
      const t = templates.find((x) => x.id === templateId)
      return Array.isArray(t?.buttons)
        ? (t!.buttons as { type?: string; text?: string }[]).filter((b) => b.type === 'QUICK_REPLY' && b.text).length
        : 0
    }
    for (const n of nodes) {
      if (n.type !== 'action' || !n.templateId) continue
      // Ce nœud est-il un point de branchement (l'IA y a posé des sorties `button:`) ?
      const branches = graph.edges.filter((e) => e.from === n.id && e.branch?.startsWith('button:'))
      if (branches.length === 0) continue
      if (qrCountOf(n.templateId) > 0) continue // le modèle a bien des boutons

      const labels = branches
        .filter((e) => e.branch !== BUTTON_TIMEOUT_BRANCH)
        .map((e) => e.branch!.slice('button:'.length))
      console.warn(`[automations/converse] modèle sans bouton sur un point de branchement → à créer (${labels.join(', ')})`)
      n.templateId = null
      // Le brief porte les boutons EXACTS attendus par les branches : le message
      // créé pourra se rebrancher tel quel.
      ;(n as { todo?: { purpose: string; suggestion?: string } }).todo = {
        purpose: labels.length > 0
          ? `Message avec les boutons : ${labels.join(', ')}`
          : 'Message avec boutons de réponse rapide',
        suggestion: labels.length > 0
          ? `Ce message porte les branches du parcours : il lui faut EXACTEMENT les boutons de réponse rapide ${labels.map((l) => `« ${l} »`).join(' et ')}. Sans eux, la suite du parcours ne peut pas se déclencher.`
          : 'Ce message doit porter des boutons de réponse rapide : ce sont eux qui branchent la suite du parcours.',
      }
      unbranchable++
    }

    // ⚠️ CAS PLUS SOURNOIS : l'IA prend un modèle sans bouton ET ne pose AUCUNE
    // branche — alors que le marchand en a explicitement demandé.
    //
    // Le contrôle ci-dessus ne le voit pas : sans arête `button:`, ce nœud
    // ressemble à un message ordinaire. C'est pourtant le cas signalé (« quand je
    // dis que je veux un bouton, ça ne le met pas ») : le parcours s'arrête au
    // premier message, et le test A/B demandé derrière n'existe jamais.
    //
    // On regarde donc ce que le marchand a ÉCRIT. S'il a demandé des boutons et
    // que le PREMIER message n'en a aucun, on vide ce nœud : lui seul porte le
    // branchement.
    const askedButtons = messages.some(
      (m) => m.role === 'user' && /\bboutons?\b/i.test(m.content)
    )
    if (askedButtons && unbranchable === 0) {
      const trig0 = nodes.find((n) => n.type === 'trigger')
      const firstEdge = trig0 && graph.edges.find((e) => e.from === trig0.id)
      const first = firstEdge && nodes.find((n) => n.id === firstEdge.to)
      if (first?.type === 'action' && first.templateId && qrCountOf(first.templateId) === 0) {
        console.warn('[automations/converse] boutons demandés mais 1er message sans bouton → à créer')
        first.templateId = null
        ;(first as { todo?: { purpose: string; suggestion?: string } }).todo = {
          purpose: 'Message d’ouverture avec boutons de réponse rapide',
          suggestion:
            'Vous avez demandé des boutons : ce message doit en porter. Aucun de vos modèles n’en a — '
            + 'créez-le avec les boutons de réponse rapide voulus (ex. « Code promo », « Visiter la boutique »). '
            + 'Ce sont eux qui branchent la suite du parcours.',
        }
        unbranchable++
      }
    }
  }
  if (unbranchable > 0) {
    console.warn(`[automations/converse] ${unbranchable} message(s) sans bouton retiré(s) d'un point de branchement`)
  }

  // ⚠️ LE MÊME MODÈLE UTILISÉ PLUSIEURS FOIS DANS LE PARCOURS.
  //
  // La consigne l'interdit déjà — mais une consigne ne borne rien : constaté en
  // production, un parcours généré répétait le même message à plusieurs étapes.
  // Le client reçoit alors deux fois le même texte, ce qui n'a aucun sens pour
  // lui et le pousse à ignorer (voire bloquer) — et le faible taux de lecture
  // dégrade à lui seul la réputation du numéro.
  //
  // On garde la PREMIÈRE occurrence et on vide les suivantes : le nœud devient
  // « message à créer », décrit dans missingTemplates. Mieux vaut un message à
  // écrire qu'un doublon envoyé pour de vrai.
  const seenTpl = new Set<string>()
  let deduped = 0
  for (const n of nodes) {
    if (n.type !== 'action' || !n.templateId) continue
    if (seenTpl.has(n.templateId)) {
      n.templateId = null
      deduped++
      continue
    }
    seenTpl.add(n.templateId)
  }

  // ⚠️ QUASI-DOUBLONS : deux modèles DIFFÉRENTS qui disent la même chose.
  //
  // Le dédoublonnage par id ne les voit pas. Constaté en production :
  // « message_bienvenue » puis « welcome » à la suite — deux noms distincts, deux
  // fois le même propos. Le client reçoit deux messages de bienvenue.
  //
  // ⚠️ LE `use_case` SEUL NE SUFFIT PAS À CONCLURE.
  //
  // Premier essai : « deux messages du même usage à la suite = doublon ». Trop
  // grossier — testé, ça supprimait « commande expédiée » après « commande
  // payée », alors que ce sont deux étapes parfaitement légitimes d'un suivi
  // (toutes deux en `order_status`). On aurait cassé un parcours correct.
  //
  // On ne cible donc que `support`, l'usage fourre-tout qui mélange bienvenue,
  // avis et SAV — c'est là que le vrai doublon se produit (« message_bienvenue »
  // puis « welcome », constaté en production), parce que deux messages d'accueil
  // consécutifs n'ont aucun sens. Les usages à ÉTAPES (order_status, cart,
  // billing) décrivent, eux, une progression : on n'y touche pas.
  //
  // On ne compare pas les textes : deux formulations proches peuvent être une
  // relance légitime (« votre panier vous attend » puis « dernière chance »).
  const AMBIGUOUS_USE_CASES = new Set(['support'])
  const tplUseCase = new Map(templates.map((t) => [t.id, t.use_case]))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // Message suivant, EN TRAVERSANT les délais : le graphe réel est
  // action → delay → action, jamais action → action. Comparer les seules arêtes
  // directes ne verrait donc aucun doublon.
  const nextAction = (fromId: string, seen = new Set<string>()): typeof nodes[number] | null => {
    if (seen.has(fromId)) return null // sécurité anti-cycle
    seen.add(fromId)
    for (const e of graph.edges || []) {
      if (e.from !== fromId) continue
      // Une branche (condition, bouton, variante) change le contexte : deux
      // messages du même usage dans des branches DIFFÉRENTES sont légitimes.
      if (e.branch) continue
      const to = nodeById.get(e.to)
      if (!to) continue
      if (to.type === 'action') return to
      if (to.type === 'delay') return nextAction(to.id, seen)
      return null // condition / ab_test : on s'arrête, le contexte diverge
    }
    return null
  }

  for (const n of nodes) {
    if (n.type !== 'action' || !n.templateId) continue
    const next = nextAction(n.id)
    if (!next || next.type !== 'action' || !next.templateId) continue
    const ucA = tplUseCase.get(n.templateId), ucB = tplUseCase.get(next.templateId)
    if (ucA && ucA === ucB && AMBIGUOUS_USE_CASES.has(ucA) && n.templateId !== next.templateId) {
      console.warn(`[automations/converse] quasi-doublon (${ucA}) retiré : 2 messages d'accueil à la suite`)
      next.templateId = null
      deduped++
    }
  }

  if (deduped > 0) {
    console.warn(`[automations/converse] ${deduped} modèle(s) en doublon retiré(s) du parcours`)
  }

  // ⚠️ BRANCHE SUR UN BOUTON **LIEN** → ELLE NE PARTIRA JAMAIS.
  //
  // Meta n'envoie aucun webhook quand un client clique un bouton URL : WhatsApp
  // ouvre le navigateur, et nous n'en savons rien. Seule une RÉPONSE RAPIDE nous
  // revient. Une arête button:"Visiter le site" (bouton lien) est donc du parcours
  // mort : le marchand voit une branche dans son éditeur, la croit active, et elle
  // ne se déclenche pas une seule fois. Constaté sur « Découvrir » + « Visiter le
  // site », où l'IA avait branché les deux.
  //
  // La doctrine le dit maintenant à l'IA — mais un prompt n'est jamais une
  // garantie : on tranche ici sur la seule source de vérité, les boutons réels du
  // modèle.
  //
  // ⚠️ AVANT le recousage des nœuds non reliés (juste en dessous) : couper une
  // branche peut orpheliner le message qu'elle visait. Placé après, ce message
  // serait perdu — invisible dans l'éditeur. Là, il est raccroché à la suite du
  // parcours, et le marchand le voit.
  let deadLinkBranches = 0
  if (Array.isArray(graph.edges)) {
    const nodeById2 = new Map(nodes.map((n) => [n.id, n]))
    const normLbl = (s: string) => s.toLowerCase().replace(/[’ʼ]/g, "'").trim()
    const qrLabels = (templateId: string | null | undefined): Set<string> => {
      const t = templateId ? templates.find((x) => x.id === templateId) : null
      const arr = Array.isArray(t?.buttons) ? (t!.buttons as { type?: string; text?: string }[]) : []
      return new Set(
        arr.filter((b) => b.type === 'QUICK_REPLY' && b.text).map((b) => normLbl(b.text!))
      )
    }
    graph.edges = graph.edges.filter((e) => {
      if (!e.branch?.startsWith('button:') || e.branch === BUTTON_TIMEOUT_BRANCH) return true
      const src = nodeById2.get(e.from)
      if (src?.type !== 'action') return true
      const tplId = (src as { templateId?: string | null }).templateId
      // Modèle pas encore choisi (brouillon à créer) : on ne peut rien affirmer,
      // on laisse — le marchand rattachera son message et ses boutons suivront.
      if (!tplId) return true
      const labels = qrLabels(tplId)
      // Modèle sans AUCUNE réponse rapide : c'est le garde-fou « modèle sans
      // bouton » qui traite le cas, plus haut. Ne pas empiéter.
      if (labels.size === 0) return true
      if (labels.has(normLbl(e.branch.slice('button:'.length)))) return true
      console.warn(`[automations/converse] branche "${e.branch}" ne correspond à aucune réponse rapide → retirée (bouton lien ou libellé inventé)`)
      deadLinkBranches++
      return false
    })
  }
  if (deadLinkBranches > 0) {
    console.warn(`[automations/converse] ${deadLinkBranches} branche(s) morte(s) retirée(s)`)
  }

  // ⚠️ NŒUDS NON RELIÉS AU DÉCLENCHEUR → INVISIBLES ET JAMAIS ENVOYÉS.
  //
  // Constaté : « Souhaiter un anniversaire » produisait un parcours annoncé à
  // « 1 message »… dont le canvas ne montrait QUE le déclencheur. L'IA avait bien
  // créé le nœud message, mais SANS l'arête trigger → message.
  //
  // L'affichage suit les arêtes (chainFrom) : un nœud sans arête entrante n'est
  // jamais rendu. Le moteur non plus ne l'atteindrait jamais. Et validateGraph ne
  // vérifiait pas l'atteignabilité — seulement les arêtes orphelines. Le parcours
  // passait donc pour valide tout en étant vide.
  //
  // On RECOUD plutôt que de rejeter : le message existe, il est pertinent, il
  // manque juste son fil. On le raccroche à la fin de la chaîne principale.
  let relinked = 0
  if (Array.isArray(graph.edges) && Array.isArray(graph.nodes)) {
    const trig0 = nodes.find((n) => n.type === 'trigger')
    if (trig0) {
      // Parcours en largeur depuis le déclencheur : qui est atteignable ?
      const reachable = new Set<string>([trig0.id])
      const queue = [trig0.id]
      while (queue.length) {
        const cur = queue.shift()!
        for (const e of graph.edges.filter((x) => x.from === cur)) {
          if (reachable.has(e.to)) continue
          reachable.add(e.to)
          queue.push(e.to)
        }
      }
      // Dernier nœud de la chaîne principale : c'est là qu'on raccroche.
      const tailOf = (start: string): string => {
        let cur = start
        const seen = new Set<string>([cur])
        for (;;) {
          const next = graph.edges.find((e) => e.from === cur && !e.branch)
          if (!next || seen.has(next.to)) return cur
          seen.add(next.to)
          cur = next.to
        }
      }
      for (const n of nodes) {
        if (n.type === 'trigger' || reachable.has(n.id)) continue
        const tail = tailOf(trig0.id)
        // Un nœud qui se ramifie ne prend pas de suite « en vrac » : on ne
        // raccroche qu'à un point qui accepte une continuité simple.
        // La fin de chaîne se ramifie (message à boutons) : on ne peut pas y
        // accrocher une suite « en vrac » — validateGraph refuse une sortie sans
        // branche à côté de sorties `button:`. On tente alors la branche PAR
        // DÉFAUT, qui est justement la continuité normale du parcours.
        //
        // Sans ça on abandonnait, le nœud restait orphelin, et le parcours ENTIER
        // était refusé — le marchand perdait tout.
        const tailBranches = graph.edges.filter((e) => e.from === tail && e.branch)
        if (tailBranches.length > 0) {
          const hasDefault = tailBranches.some((e) => e.branch === BUTTON_TIMEOUT_BRANCH)
          const isButtonNode = tailBranches.some((e) => e.branch?.startsWith('button:'))
          if (isButtonNode && !hasDefault) {
            graph.edges.push({ from: tail, to: n.id, branch: BUTTON_TIMEOUT_BRANCH })
            reachable.add(n.id)
            relinked++
          }
          continue
        }
        graph.edges.push({ from: tail, to: n.id })
        reachable.add(n.id)
        relinked++
      }
    }
  }
  if (relinked > 0) {
    console.warn(`[automations/converse] ${relinked} nœud(s) non relié(s) au déclencheur → raccroché(s)`)
  }

  // ⚠️ MÊME MESSAGE SUR UN BOUTON ET SUR « PAR DÉFAUT » → ENVOYÉ DEUX FOIS.
  //
  // « Par défaut » (button:__timeout__) part DANS TOUS LES CAS, que le client
  // clique ou non. Constaté : l'IA plaçait le MÊME modèle sur « Code promo » et
  // sur « Par défaut », croyant couvrir les deux cas — un client qui clique
  // recevait donc deux fois le même texte.
  //
  // On retire le doublon de la branche BOUTON et on garde « par défaut » : ce
  // dernier couvre tout le monde, donc le message est envoyé à tous une seule
  // fois — ce que l'IA cherchait à faire.
  let dedupDefault = 0
  if (Array.isArray(graph.edges)) {
    const byIdD = new Map(nodes.map((n) => [n.id, n]))
    const tplOfBranch = (fromId: string, branch: string): string | null => {
      const e = graph.edges.find((x) => x.from === fromId && x.branch === branch)
      const n = e ? byIdD.get(e.to) : undefined
      return n?.type === 'action' ? ((n as { templateId: string | null }).templateId ?? null) : null
    }
    for (const n of nodes) {
      if (n.type !== 'action') continue
      const def = tplOfBranch(n.id, BUTTON_TIMEOUT_BRANCH)
      if (!def) continue
      for (const e of graph.edges.filter((x) => x.from === n.id && x.branch?.startsWith('button:') && x.branch !== BUTTON_TIMEOUT_BRANCH)) {
        if (tplOfBranch(n.id, e.branch!) !== def) continue
        console.warn(`[automations/converse] même message sur « ${e.branch!.slice(7)} » et « par défaut » → branche retirée (il serait envoyé 2 fois)`)
        graph.edges = graph.edges.filter((x) => x !== e)
        dedupDefault++
      }
    }
  }
  if (dedupDefault > 0) {
    console.warn(`[automations/converse] ${dedupDefault} branche(s) faisant doublon avec « par défaut » retirée(s)`)
  }

  // ⚠️ LE CLIENT QUI A CLIQUÉ NE DOIT PAS ÊTRE RELANCÉ.
  //
  // Constaté : chaque branche de bouton menait à un message qui reproposait les
  // MÊMES boutons — le client tournait en rond et voyait s'empiler « Finaliser »,
  // « J'ai une question », « Utiliser le code »… Un parcours n'est pas un
  // labyrinthe : quelqu'un qui a cliqué « Oui » a répondu, on lui donne ce qu'il
  // demande et on s'arrête. Le relancer est le meilleur moyen de le faire bloquer.
  //
  // On coupe donc ce qui suit un message de branche « bouton » quand ce message
  // reproposerait les mêmes boutons. On ne touche PAS à la branche
  // `button:__timeout__` : celle-là s'adresse à qui n'a PAS cliqué, et c'est
  // justement là que la relance a du sens.
  let cutLoops = 0
  if (Array.isArray(graph.edges)) {
    const nodeByIdL = new Map(nodes.map((n) => [n.id, n]))
    const qrOf = (templateId: string | null | undefined): string[] => {
      if (!templateId) return []
      const t = templates.find((x) => x.id === templateId)
      return Array.isArray(t?.buttons)
        ? (t!.buttons as { type?: string; text?: string }[])
            .filter((b) => b.type === 'QUICK_REPLY' && b.text).map((b) => b.text!)
        : []
    }
    for (const e of [...graph.edges]) {
      // Sortie d'un CLIC réel (pas le timeout).
      if (!e.branch?.startsWith('button:') || e.branch === BUTTON_TIMEOUT_BRANCH) continue
      const target = nodeByIdL.get(e.to)
      if (target?.type !== 'action') continue
      // Ce message de réponse reproposerait-il des boutons ? Si oui, ses propres
      // sorties `button:` ramènent le client dans la boucle.
      const outs = graph.edges.filter((x) => x.from === target.id && x.branch?.startsWith('button:'))
      if (outs.length === 0) continue
      if (qrOf((target as { templateId: string | null }).templateId).length === 0) continue
      graph.edges = graph.edges.filter((x) => !(x.from === target.id && x.branch?.startsWith('button:')))
      cutLoops++
    }
  }
  if (cutLoops > 0) {
    console.warn(`[automations/converse] ${cutLoops} branche(s) en boucle coupée(s) : le client qui a cliqué ne doit pas être relancé`)
  }

  // ⚠️ CONDITION SANS EFFET → ON LA RETIRE DU PARCOURS.
  //
  // Constaté en production sur une relance de panier : une condition absurde, du
  // type « montant > 0 ». Elle est TOUJOURS vraie (un panier a forcément un
  // montant), donc la branche "no" est morte — mais le marchand, lui, voit une
  // condition dans son parcours et cherche ce qu'elle fait.
  //
  // La cause est notre doctrine : elle demandait « ajoute une condition (a-t-il
  // commandé ?) avant chaque relance ». Or AUCUN champ n'exprime ça — et c'est
  // déjà géré automatiquement par le cron (il annule la relance dès qu'une
  // commande arrive). L'IA obéissait donc avec les moyens du bord.
  //
  // On supprime le nœud et on recoud le parcours sur sa branche "yes" (celle qui
  // s'exécute toujours) : le marchand récupère un parcours propre plutôt qu'un
  // aiguillage qui n'aiguille rien.
  const isAlwaysTrue = (rule: { field?: string; op?: string; value?: unknown }): boolean => {
    // Seul cas certain et fréquent : un seuil de montant à 0 ou moins. Sur tout
    // déclencheur qui porte un panier/commande, le total est toujours > 0.
    if (rule.field !== 'order_total') return false
    const v = Number(rule.value)
    if (!Number.isFinite(v)) return false
    return (rule.op === '>' && v <= 0) || (rule.op === '>=' && v <= 0) || (rule.op === '!=' && v === 0)
  }
  let droppedConds = 0
  for (const n of [...nodes]) {
    if (n.type !== 'condition') continue
    if (!isAlwaysTrue((n as { rule?: { field?: string; op?: string; value?: unknown } }).rule || {})) continue

    const incoming = (graph.edges || []).filter((e) => e.to === n.id)
    const yes = (graph.edges || []).find((e) => e.from === n.id && e.branch === 'yes')
    if (!yes) continue // structure inattendue : on ne touche à rien

    // Les entrants pointent désormais sur la suite du "yes"…
    for (const e of incoming) e.to = yes.to
    // …et le nœud + toutes ses sorties disparaissent.
    graph.edges = (graph.edges || []).filter((e) => e.from !== n.id)
    const i = nodes.indexOf(n)
    if (i >= 0) nodes.splice(i, 1)
    droppedConds++
  }
  if (droppedConds > 0) {
    console.warn(`[automations/converse] ${droppedConds} condition(s) toujours vraie(s) retirée(s)`)
  }

  // ⚠️ DEUX MESSAGES QUI SE SUIVENT SANS DÉLAI PARTENT EN MÊME TEMPS.
  //
  // Constaté : l'IA enchaîne parfois deux "action" sans "delay" entre elles. Le
  // client reçoit alors deux messages d'affilée — il les ignore, et le faible
  // taux de lecture dégrade à lui seul la réputation du numéro (donc la
  // délivrabilité de TOUS les envois du marchand).
  //
  // On insère le délai manquant plutôt que de rejeter le parcours : le marchand
  // ajustera la durée, mais il ne recevra jamais un parcours qui mitraille.
  let insertedDelays = 0
  if (Array.isArray(graph.edges)) {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const e of [...graph.edges]) {
      const from = byId.get(e.from), to = byId.get(e.to)
      if (from?.type !== 'action' || to?.type !== 'action') continue
      // Les branches boutons mènent volontairement à une suite immédiate : le
      // client vient de cliquer, il ATTEND la réponse. On ne les retarde pas.
      if (e.branch) continue
      const id = `delay_auto_${insertedDelays + 1}`
      nodes.push({ id, type: 'delay', minutes: 1440 })
      graph.edges.push({ from: id, to: e.to })
      e.to = id
      insertedDelays++
    }
  }
  if (insertedDelays > 0) {
    console.warn(`[automations/converse] ${insertedDelays} délai(s) inséré(s) entre des messages consécutifs`)
  }

  // Délai hors presets → il s'afficherait mal dans l'éditeur. On ramène au
  // preset le plus proche : le marchand voit une valeur, pas un champ vide.
  const DELAY_PRESETS = [0, 30, 60, 180, 1440, 2880, 10080]
  for (const n of nodes) {
    if (n.type !== 'delay') continue
    const m = Number((n as { minutes?: number }).minutes)
    if (!Number.isFinite(m)) { (n as { minutes: number }).minutes = 1440; continue }
    if (DELAY_PRESETS.includes(m)) continue
    const closest = DELAY_PRESETS.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))
    console.warn(`[automations/converse] délai ${m} min hors presets → ${closest}`)
    ;(n as { minutes: number }).minutes = closest
  }

  // ⚠️ ON BRANCHE LES MESSAGES À BOUTONS LAISSÉS LINÉAIRES.
  //
  // La doctrine du prompt demande de brancher dès qu'un modèle a des boutons.
  // Mesuré : le modèle l'ignore la plupart du temps et produit une chaîne
  // d'envois. Or c'est précisément le clic qui fait l'intérêt des boutons — il
  // compte comme une réponse, rouvre 24 h de discussion libre et sort les envois
  // suivants du plafond marketing de Meta. Un bouton non branché gâche ça.
  //
  // On rattrape donc côté serveur : la sortie unique du nœud devient la suite
  // par défaut (`button:__timeout__`, celui qui ne clique pas), et chaque bouton
  // reçoit sa propre arête vers cette même suite. Le marchand n'a plus qu'à
  // rediriger les branches qui l'intéressent — au lieu de tout câbler.
  //
  // `validateGraph` impose que TOUTES les sorties d'un nœud à boutons soient des
  // branches `button:` : on convertit donc l'arête existante, on n'en ajoute pas
  // une à côté (ce qui produirait un wildcard ambigu et un graphe invalide).
  let autoBranched = 0
  const qrLabelsOf = (templateId: string | null): string[] => {
    if (!templateId) return []
    const t = templates.find((x) => x.id === templateId)
    return Array.isArray(t?.buttons)
      ? (t!.buttons as { type?: string; text?: string }[])
          .filter((b) => b.type === 'QUICK_REPLY' && b.text)
          .map((b) => b.text!)
      : []
  }
  if (Array.isArray(graph.edges)) {
    for (const n of nodes) {
      if (n.type !== 'action') continue
      const labels = qrLabelsOf((n as { templateId: string | null }).templateId)
      if (labels.length === 0) continue
      const outs = graph.edges.filter((e) => e.from === n.id)
      // Déjà branché : l'IA a fait le travail, on n'y touche pas.
      if (outs.some((e) => e.branch)) continue

      if (outs.length === 1) {
        // Sortie unique et non branchée → elle devient la suite par défaut, et
        // chaque bouton reçoit son arête vers cette même suite.
        const next = outs[0].to
        outs[0].branch = BUTTON_TIMEOUT_BRANCH
        for (const label of labels) {
          graph.edges.push({ from: n.id, to: next, branch: buttonBranch(label) })
        }
        autoBranched++
      }
      // ⚠️ DERNIER message du parcours (aucune sortie) : ON NE TOUCHE À RIEN.
      //
      // Tentant d'y poser quand même des branches `button:` — mais elles
      // devraient pointer quelque part, et le seul nœud disponible est LUI-MÊME.
      // `nextNodes` suivrait l'arête et renverrait le message à chaque clic :
      // une boucle infinie, exactement ce que les branches sont censées éviter.
      //
      // Le clic n'est d'ailleurs pas perdu : il compte comme une réponse et
      // rouvre la fenêtre de 24 h, ce qui laisse l'agent IA répondre librement.
      // On ne gagnerait qu'une branche décorative — au prix d'une boucle.
    }
  }
  if (autoBranched > 0) {
    console.warn(`[automations/converse] ${autoBranched} message(s) à boutons branché(s) automatiquement`)
  }

  const errors = validateGraph(graph)
  // ⚠️ ERREURS TOLÉRÉES : celles que le marchand peut corriger dans l'éditeur.
  //
  //  - « n'a pas de modèle » : le nœud attend un message à créer, c'est prévu.
  //  - « n'est relié à rien » : le nœud existe mais son fil manque. On tente de
  //    le recoudre plus haut ; quand la fin de chaîne se ramifie (message à
  //    boutons), on ne peut pas raccrocher « en vrac » et il reste orphelin.
  //
  // Cette dernière est devenue BLOQUANTE quand je l'ai ajoutée à validateGraph :
  // un parcours entier était refusé (« Je n'ai pas réussi à construire un
  // parcours valide ») alors que tout le reste était bon. Refuser un parcours à
  // 90 % correct est PIRE que le livrer avec un bloc à rebrancher : le marchand
  // perd tout, sans savoir quoi corriger. L'éditeur, lui, affiche le bloc et
  // permet de le relier d'un clic.
  const blocking = errors.filter((e) => !/n'a pas de modèle|n'est relié à rien/.test(e))
  if (blocking.length > 0) {
    return NextResponse.json({
      mode: 'ask',
      question: 'Je n’ai pas réussi à construire un parcours valide. Pouvez-vous préciser votre objectif ?',
    })
  }

  // ⚠️ AUCUNE ÉTAPE N'A DE MESSAGE → CE N'EST PAS UN PARCOURS, C'EST UN SQUELETTE.
  //
  // Tolérer les actions sans modèle a du sens quand il en manque UNE ou DEUX : le
  // marchand complète, et le reste du travail (déclencheur, délais, branches) lui
  // est acquis. Mais quand AUCUNE n'a de message, on ne lui livre rien d'utile —
  // juste une coquille vide qu'il doit remplir entièrement, et une automatisation
  // qu'il ne peut évidemment pas activer. Constaté en production.
  //
  // On bascule alors sur `need_templates` : le mode prévu pour « il faut d'abord
  // créer des messages », qui affiche les suggestions ET les boutons pour les
  // créer en un clic. C'est le même travail, mais dans le bon ordre.
  //
  // ⚠️ SAUF si le marchand VIENT de créer ses messages. Sinon c'est l'impasse :
  // on lui demande de créer des messages, il les crée, et on lui redemande de les
  // créer — le mode `need_templates` boucle sur lui-même. Constaté : trois fois
  // d'affilée la même réponse, aucun moyen d'en sortir. Ses modèles existent : on
  // livre le parcours, quitte à ce qu'il rattache un nœud ou deux dans l'éditeur.
  const actionNodes = nodes.filter((n) => n.type === 'action')
  const withTemplate = actionNodes.filter((n) => n.templateId)
  if (actionNodes.length > 0 && withTemplate.length === 0 && createdIds.length === 0) {
    console.warn('[automations/converse] aucune action avec modèle → need_templates')
    return NextResponse.json({
      mode: 'need_templates',
      message:
        'Aucun de vos modèles ne correspond à ce parcours. Créez d’abord le(s) message(s) ci-dessous — '
        + 'je pourrai ensuite construire l’automatisation complète.',
      missingTemplates: missing.length > 0 ? missing : [{
        purpose: 'Message principal de ce parcours',
        suggestion:
          'Allez droit au but : rappelez le contexte, donnez UNE raison d’agir maintenant, '
          + 'et terminez par un bouton de réponse rapide (ex. « Finaliser ma commande »). '
          + 'Un clic rouvre 24 h de discussion — c’est ce qui permet à l’agent IA de répondre.',
      }],
    })
  }

  const trig = nodes.find((n) => n.type === 'trigger') as { event?: string } | undefined

  // ⚠️ Le déclencheur doit appartenir à la FAMILLE demandée (campagne vs
  // transactionnel). Le prompt ne présente déjà que ceux de la bonne famille,
  // mais rien ne vérifiait ce que l'IA renvoyait : elle pouvait donc poser un
  // déclencheur marketing sur une automatisation transactionnelle, qui
  // n'apparaîtrait alors même pas dans l'onglet où le marchand l'a créée.
  const allowedForKind = new Set(triggersForKind(kind).map((e) => e.value as string))
  let triggerOk = !!trig?.event
    && TRIGGER_EVENTS.some((e) => e.value === trig.event)
    && allowedForKind.has(trig.event)

  // Déclencheur hors famille (ou inventé) → on ne laisse PAS le marchand avec un
  // parcours sans déclencheur : on retombe sur celui de sa famille qui est le
  // point d'entrée le plus courant. Il reste modifiable d'un clic dans l'éditeur,
  // alors qu'un parcours sans déclencheur ne part jamais et n'explique pas
  // pourquoi. Constaté en test : « automatiser des trucs » en transactionnel
  // produisait contact_opted_in, qui est un déclencheur marketing.
  if (trig && !triggerOk) {
    const fallback = kind === 'marketing' ? 'checkout_abandoned' : 'order_paid'
    console.warn(`[automations/converse] déclencheur "${trig.event}" hors famille ${kind} → repli sur ${fallback}`)
    trig.event = fallback
    triggerOk = allowedForKind.has(fallback)
  }
  const usedTemplates = nodes
    .filter((n) => n.type === 'action' && n.templateId)
    .map((n) => (n as { templateId: string }).templateId)

  // Nœuds SANS modèle (l'IA n'en avait pas de valable, ou son id était halluciné).
  // Chacun doit être expliqué au marchand avec des conseils pour convertir : on
  // complète `missing` si l'IA n'a pas décrit assez de messages à créer.
  const emptyActionNodes = nodes.filter((n) => n.type === 'action' && !n.templateId)

  // ⚠️ LE BRIFF DE COMPLÉMENT DOIT DIRE CE QU'EST **CE** NŒUD.
  //
  // Il était générique (« rappelez le contexte : panier, commande, offre »). Sur
  // un parcours « A/B : carrousel contre code promo », l'IA décrivait 2 messages
  // sur 3 et le complément produisait un conseil parlant de panier pour un nœud
  // qui devait être un CARROUSEL. Le marchand voyait une variante A vide, sans
  // savoir quoi y mettre — le carrousel apparaissait pourtant dans l'aperçu.
  //
  // On déduit donc l'intention du nœud de sa PLACE : le libellé posé par l'IA, ou
  // la branche qui y mène (variante A/B, bouton). C'est imparfait, mais toujours
  // plus utile qu'un conseil hors sujet.
  const roleOf = (node: typeof nodes[number]): { purpose: string; suggestion: string } => {
    const label = (node as { label?: string }).label || ''
    const inEdge = (graph.edges || []).find((e) => e.to === node.id)
    const branch = inEdge?.branch || ''
    const hint = `${label} ${branch}`.toLowerCase()

    if (/carrousel|carousel/.test(hint)) {
      return {
        purpose: 'Carrousel de produits',
        suggestion: 'Un carrousel présentant 3 à 5 produits de votre boutique (image, titre, lien). '
          + 'Choisissez des produits que ce client est susceptible d’aimer.',
      }
    }
    if (/promo|code|réduction|remise/.test(hint)) {
      return {
        purpose: 'Message avec code promo',
        suggestion: 'Donnez le code, dites ce qu’il offre et jusqu’à quand. Une raison d’agir maintenant, '
          + 'et un bouton pour finaliser.',
      }
    }
    if (branch.startsWith('variant:')) {
      const v = branch.slice('variant:'.length)
      return {
        purpose: `Message de la variante ${v} (test A/B)`,
        suggestion: `Cette variante s’oppose aux autres : elle doit tester une VRAIE différence `
          + `(avec ou sans offre, angle produit contre angle service…), pas une reformulation.`,
      }
    }
    return {
      purpose: label ? `${label} (à créer)` : `Message ${missing.length + 1} du parcours (à créer)`,
      suggestion:
        'Allez droit au but : rappelez le contexte, donnez UNE raison d’agir maintenant '
        + '(code promo, livraison offerte, stock limité) et terminez par un bouton de réponse rapide '
        + '(ex. « Finaliser ma commande », « J’ai une question »). Un message court convertit mieux qu’un long.',
    }
  }

  // ⚠️ ON APPARIE D'ABORD LES BRIEFS DE L'IA À LEUR NŒUD, PAR LE SENS.
  //
  // Se fier à l'ordre (« le i-e brief = le i-e nœud vide ») est FAUX : testé sur
  // « A/B carrousel contre code promo », l'IA décrivait le message d'ouverture et
  // celui du site, mais pas le carrousel. Le complément prenait alors le 3e nœud
  // dans l'ordre du graphe et lui collait le brief « message vers le site » —
  // sur le nœud CARROUSEL. Le marchand recevait un conseil hors sujet.
  //
  // On rapproche donc chaque brief du nœud dont le libellé lui ressemble, et on
  // ne complète QUE les nœuds restés sans brief — avec un texte déduit de LEUR
  // rôle (cf. roleOf).
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const taken = new Set<string>()
  for (const m of missing) {
    const p = norm(m.purpose)
    const match = emptyActionNodes.find((n) => {
      if (taken.has(n.id)) return false
      const label = norm((n as { label?: string }).label || '')
      if (!label) return false
      // Un mot significatif partagé suffit : les libellés sont courts et l'IA
      // reprend en général les mêmes termes dans le brief et dans le nœud.
      return label.split(/\s+/).some((w) => w.length > 4 && p.includes(w))
    })
    if (match) { m.nodeId = match.id; taken.add(match.id) }
  }
  // Les briefs sans nœud apparié prennent les nœuds libres, dans l'ordre.
  for (const m of missing) {
    if (m.nodeId) continue
    const free = emptyActionNodes.find((n) => !taken.has(n.id))
    if (!free) break
    m.nodeId = free.id
    taken.add(free.id)
  }
  // Nœuds encore sans brief → on en fabrique un, déduit de LEUR rôle.
  for (const n of emptyActionNodes) {
    if (taken.has(n.id)) continue
    const r = roleOf(n)
    missing.push({ ...r, nodeId: n.id })
    taken.add(n.id)
  }

  // Le brief voyage AVEC le nœud (cf. plus bas) : le chat disparaît une fois le
  // parcours créé, mais le marchand doit garder le conseil sous les yeux.
  for (const m of missing) {
    const target = emptyActionNodes.find((n) => n.id === m.nodeId)
    if (!target) continue
    // Sans ça, le marchand rouvrait son automatisation, tombait sur « Choisir un
    // modèle » et n'avait plus aucune trace de ce que l'IA lui avait conseillé.
    ;(target as { todo?: { purpose: string; suggestion?: string } }).todo = {
      purpose: m.purpose,
      suggestion: m.suggestion,
    }
  }

  return NextResponse.json({
    mode: 'ready',
    name: (decision.name || '').trim() || 'Nouveau parcours',
    graph,
    trigger: triggerOk ? trig!.event : null,
    explanation: (decision.explanation || '').trim(),
    usedTemplates,
    missingTemplates: missing,
    hallucinated, // nb de nœuds dont le modèle est à choisir par le marchand
  })
}
