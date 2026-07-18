import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { createPendingAction, type ActionType } from './actions'
import { getValidAccessToken } from './token'
import { findOrderIdByName, getRefundableOrder, getSuggestedRefund, findCustomerByEmail, findOrdersByCustomerId, type RefundLineItem } from './client'

/**
 * Outils IA (function calling) pour les actions Shopify.
 *
 * L'agent appelle ces fonctions quand un client demande une action sensible.
 * Elles ne FONT rien sur la boutique : elles créent une action "pending"
 * qu'un humain validera. L'agent doit dire au client que sa demande est prise
 * en compte et sera traitée.
 *
 * Ces outils ne sont proposés à l'agent QUE si l'utilisateur a une boutique
 * Shopify connectée.
 */

export type ActionToolCall = { functionName: string; arguments: Record<string, unknown> }

/** Définitions OpenAI (format function calling) des 3 actions. */
export const SHOPIFY_ACTION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'request_cancel_order',
      description:
        "Enregistre une demande d'ANNULATION de commande quand le client le demande. N'annule pas directement : la demande sera validée par un humain. Réponds ensuite au client que sa demande est prise en compte.",
      parameters: {
        type: 'object',
        properties: {
          order_name: { type: 'string', description: "Numéro de commande, ex: #1024" },
          reason: { type: 'string', description: 'Raison invoquée par le client (optionnel)' },
        },
        required: ['order_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_refund',
      description:
        "Enregistre une demande de REMBOURSEMENT (total ou partiel) quand le client le demande. Par défaut, un humain valide avant remboursement. Réponds ensuite au client que sa demande est prise en compte. Choisis refund_type selon la demande : 'full' (toute la commande), 'partial_amount' (un montant précis, ex: 10€), 'partial_items' (certains articles).",
      parameters: {
        type: 'object',
        properties: {
          order_name: { type: 'string', description: "Numéro de commande, ex: #1024" },
          reason: { type: 'string', description: 'Raison du remboursement (recommandé, sera visible sur Shopify)' },
          refund_type: {
            type: 'string',
            enum: ['full', 'partial_amount', 'partial_items'],
            description: "Type de remboursement : 'full' par défaut ; 'partial_amount' si le client veut un montant ; 'partial_items' pour rembourser certains articles.",
          },
          amount: { type: 'number', description: 'Montant à rembourser (uniquement si refund_type = partial_amount)' },
          line_items: {
            type: 'array',
            description: "Articles à rembourser (uniquement si refund_type = partial_items). Décris le titre de l'article et la quantité.",
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: "Titre/nom de l'article tel que dans la commande" },
                quantity: { type: 'number', description: "Quantité à rembourser" },
              },
            },
          },
        },
        required: ['order_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_discount',
      description:
        "Enregistre une demande de CODE DE RÉDUCTION pour le client (geste commercial). Ne crée pas le code directement : un humain validera. Réponds ensuite au client que sa demande est en cours de traitement.",
      parameters: {
        type: 'object',
        properties: {
          percentage: { type: 'number', description: 'Pourcentage de réduction (ex: 10 pour 10%)' },
          amount: { type: 'number', description: 'Montant fixe de réduction (alternatif au pourcentage)' },
          reason: { type: 'string', description: 'Motif du geste commercial (optionnel)' },
        },
        required: [] as string[],
      },
    },
  },
]

/**
 * Outil d'opt-in canal : le client choisit comment recevoir ses notifications
 * (suivi de commande, expédition…). C'est l'opt-in conversationnel.
 */
export const NOTIFICATION_CHANNEL_TOOL = {
  type: 'function' as const,
  function: {
    name: 'set_notification_channel',
    description:
      "Enregistre le canal sur lequel le client veut recevoir ses notifications de suivi de commande (expédition, livraison). À appeler quand le client exprime une préférence (ex: 'préviens-moi par email', 'envoie le suivi sur WhatsApp', 'oui je veux être tenu au courant'). Confirme ensuite au client.",
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['whatsapp', 'email', 'both'],
          description: 'Canal choisi par le client',
        },
        email: {
          type: 'string',
          description: 'Adresse email si le client choisit email/both et la fournit (optionnel)',
        },
      },
      required: ['channel'],
    },
  },
}

/**
 * Outil de SUIVI DE COMMANDE (lecture seule) : quand le client demande « où est
 * ma commande ? », l'agent va chercher en temps réel le statut + le lien de
 * suivi sur Shopify et répond directement (aucune validation humaine requise).
 */
export const TRACK_ORDER_TOOL = {
  type: 'function' as const,
  function: {
    name: 'track_order',
    description:
      "Récupère le statut et le suivi de livraison des commandes du client (ex: « où est ma commande ? », « c'est quand la livraison ? », « ma commande #1024 »). Utilise le numéro de commande si le client le donne, sinon les dernières commandes du client. Réponds ensuite clairement avec le statut et le lien de suivi s'il existe.",
    parameters: {
      type: 'object',
      properties: {
        order_name: { type: 'string', description: "Numéro de commande si fourni par le client (ex: #1024). Optionnel." },
      },
      required: [] as string[],
    },
  },
}

export function isTrackOrderTool(name: string): boolean {
  return name === 'track_order'
}

/**
 * Outil de LIAISON COMPTE (Cas 2 — SAV) : quand un client écrit sur WhatsApp
 * pour du SAV mais qu'on ne le reconnaît pas encore comme client Shopify,
 * l'agent lui demande l'email de sa commande et appelle cet outil pour relier
 * son compte. Une fois relié, l'agent peut voir ses commandes de façon fiable.
 */
export const LINK_CUSTOMER_TOOL = {
  type: 'function' as const,
  function: {
    name: 'link_customer',
    description:
      "Relie le contact WhatsApp à son compte client Shopify via l'email de sa commande. À appeler quand le client fait une demande liée à une commande (SAV, suivi, remboursement) MAIS qu'on ne connaît pas encore son email/compte. Demande d'abord poliment l'email utilisé pour la commande, puis appelle cet outil. Réponds ensuite selon le résultat (compte trouvé ou non).",
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Email fourni par le client (celui utilisé pour sa commande)." },
      },
      required: ['email'],
    },
  },
}

export function isLinkCustomerTool(name: string): boolean {
  return name === 'link_customer'
}

/**
 * DÉSABONNEMENT EN LANGAGE NATUREL.
 *
 * Le mot-clé « STOP » exact est déjà géré par le webhook. Mais un client écrit
 * rarement « STOP » : il dit « je ne veux plus recevoir vos messages », « arrêtez
 * de m'écrire », « retirez-moi de votre liste ». Sans cet outil, l'agent
 * comprenait l'intention… et continuait à bavarder, jusqu'à ce que le client
 * BLOQUE le numéro — ce qui dégrade la qualité Meta (recherche 2024-2026 : les
 * blocages font chuter la note de qualité sur 7 jours et réduisent les limites
 * d'envoi). Un opt-out honoré vaut mille fois mieux qu'un blocage subi.
 *
 * ⚠️ Un prompt ne DÉSABONNE pas : il faut écrire en base. D'où cet outil, que
 * l'agent APPELLE quand il détecte l'intention — il n'y a qu'à ce moment-là que
 * le contact passe réellement en `opted_out` et que le dispatch cesse tout envoi.
 */
export const UNSUBSCRIBE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'unsubscribe_contact',
    description:
      "Désabonne le contact de TOUS les messages automatiques (campagnes, relances, agent). À appeler DÈS QUE le client exprime, même sans le mot « STOP », qu'il ne veut plus être contacté : « je ne veux plus de messages », « arrêtez de m'écrire », « retirez-moi de la liste », « désabonnez-moi », « stop pub »… En cas de doute (le client est juste agacé mais ne demande pas d'arrêter), NE PAS appeler : demande-lui d'abord s'il souhaite se désabonner. Après l'appel, confirme au client en une phrase qu'il ne recevra plus rien et qu'il peut revenir quand il veut.",
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: "Courte phrase reprenant ce que le client a dit (pour la traçabilité). Optionnel." },
      },
      required: [],
    },
  },
}

export function isUnsubscribeTool(name: string): boolean {
  return name === 'unsubscribe_contact'
}

/** Désabonne le contact de la conversation. Écrit l'opt-out et tait l'agent. */
export async function handleUnsubscribe(
  args: Record<string, unknown>,
  ctx: { userId: string; conversationId: string }
): Promise<string> {
  const supabase = createAdminSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id, contacts(opt_in_status)')
    .eq('id', ctx.conversationId)
    .maybeSingle()
  if (!conv?.contact_id) return "Impossible d'identifier le contact. Réponds au client que tu transmets sa demande à un conseiller."

  // ⚠️ DÉJÀ DÉSABONNÉ → NE RIEN REFAIRE.
  //
  // L'IA a rappelé cet outil sur un « Bonjour » parce que la conversation
  // contenait un STOP plus ANCIEN (constaté en production : désabonnement « tout
  // seul »). Le prompt lui interdit maintenant de se fier à l'historique, mais un
  // prompt n'est pas une garantie : si le contact est DÉJÀ opted_out, on ne
  // réécrit rien, on ne renvoie pas de confirmation, on ne re-notifie pas. On
  // rend juste la main à l'IA pour qu'elle réponde au message réel.
  const already = (conv as { contacts?: { opt_in_status?: string } | null }).contacts?.opt_in_status === 'opted_out'
  if (already) {
    return "Ce contact est DÉJÀ désabonné (probablement d'un message précédent). N'annonce PAS un nouveau désabonnement : réponds simplement et normalement à ce que le client demande maintenant."
  }

  // Opt-out : même effet qu'un « STOP » tapé — le dispatch bloque alors tout
  // envoi (templates ET agent).
  await supabase
    .from('contacts')
    .update({ opt_in_status: 'opted_out', opt_out_at: new Date().toISOString() })
    .eq('id', conv.contact_id)

  // On coupe l'agent sur CETTE conversation : un désabonné ne doit plus recevoir
  // de réponses automatiques. Il pourra toujours écrire, un humain répondra.
  await supabase
    .from('conversations')
    .update({ is_ai_active: false })
    .eq('id', ctx.conversationId)

  const reason = String(args.reason || '').trim().slice(0, 200)
  if (reason) console.log('[AI unsubscribe]', ctx.conversationId, '→', reason)

  // Notifier le marchand : un désabonnement est une info commerciale (perte d'un
  // canal de contact) qu'il doit voir. Le marchand a signalé « pas eu de notif ».
  const { data: sess } = await supabase
    .from('conversations')
    .select('session_id, whatsapp_sessions(user_id)')
    .eq('id', ctx.conversationId)
    .maybeSingle()
  const ownerId = (sess as { whatsapp_sessions?: { user_id?: string } } | null)?.whatsapp_sessions?.user_id || ctx.userId
  if (ownerId) {
    const { data: exists } = await supabase
      .from('user_alerts').select('id')
      .eq('user_id', ownerId).eq('alert_type', 'contact_opted_out')
      .contains('metadata', { conversation_id: ctx.conversationId }).maybeSingle()
    if (!exists) {
      await supabase.from('user_alerts').insert({
        user_id: ownerId,
        alert_type: 'contact_opted_out',
        title: 'Contact désabonné',
        message: `Un contact s'est désabonné via l'assistant${reason ? ` (« ${reason} »)` : ''}. Il ne recevra plus de messages automatiques.`,
        metadata: { conversation_id: ctx.conversationId, contact_id: conv.contact_id },
      })
    }
  }

  return "Le client est désabonné : il ne recevra plus aucun message automatique. Confirme-lui en UNE phrase, chaleureusement, qu'il ne recevra plus rien et qu'il peut revenir/écrire « START » quand il veut. Ne propose plus rien d'autre."
}

/** Relie le contact de la conversation à un client Shopify via son email. */
export async function handleLinkCustomer(
  args: Record<string, unknown>,
  ctx: { userId: string; conversationId: string }
): Promise<string> {
  const email = String(args.email || '').trim().toLowerCase()
  if (!email.includes('@')) return "Cet email ne semble pas valide. Peux-tu redemander poliment au client l'email utilisé pour sa commande ?"

  const store = await getUserStore(ctx.userId)
  if (!store) return "Aucune boutique connectée, impossible de relier le compte pour l'instant."

  const customer = await findCustomerByEmail(store.shop, store.token, email)
  if (!customer) {
    return `Aucun compte client trouvé avec l'email ${email}. Dis au client qu'on ne trouve pas de commande à cet email et demande s'il a utilisé une autre adresse.`
  }

  // Retrouver le contact de la conversation et stocker le lien + l'email.
  const supabase = createAdminSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', ctx.conversationId)
    .maybeSingle()
  if (conv?.contact_id) {
    await supabase
      .from('contacts')
      .update({ shopify_customer_id: customer.id, notify_email: email })
      .eq('id', conv.contact_id)
  }
  return `Compte client relié (${customer.displayName || email}). Tu peux maintenant consulter ses commandes et traiter sa demande. Confirme au client que son compte est bien retrouvé.`
}

/**
 * Handler du suivi de commande. Retrouve le téléphone du contact de la
 * conversation, interroge Shopify, et renvoie à l'agent un résumé lisible des
 * commandes (statut + tracking). Read-only : rien n'est écrit ni validé.
 */
export async function handleTrackOrder(
  args: Record<string, unknown>,
  ctx: { userId: string; conversationId?: string | null }
): Promise<string> {
  const store = await getUserStore(ctx.userId)
  if (!store) return "Impossible d'accéder à la boutique. Propose au client de contacter un conseiller."

  const supabase = createAdminSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Retrouver le contact (téléphone + email) de la conversation.
  let phone: string | null = null
  let email: string | null = null
  if (ctx.conversationId) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('contact_id, contacts(phone_number, notify_email, email)')
      .eq('id', ctx.conversationId)
      .maybeSingle()
    const c = conv?.contacts as { phone_number?: string; notify_email?: string; email?: string } | null
    phone = c?.phone_number || null
    email = c?.notify_email || c?.email || null
  }
  if (!phone && !email) return "Je n'ai pas retrouvé les coordonnées du client pour chercher sa commande. Demande-lui son numéro de commande ou son email."

  const { findOrdersByCustomer } = await import('./client')
  const res = await findOrdersByCustomer(store.shop, store.token, { email, phone })
  if (!res.ok) return "Le suivi n'est pas accessible pour le moment. Propose au client de réessayer ou de contacter un conseiller."

  let orders = res.data
  // Si le client a précisé un numéro, on filtre dessus.
  const wanted = args.order_name ? String(args.order_name).replace(/^#/, '') : null
  if (wanted) {
    const match = orders.filter((o) => o.name.replace(/^#/, '') === wanted)
    if (match.length > 0) orders = match
  }
  if (orders.length === 0) {
    return wanted
      ? `Aucune commande ${args.order_name} trouvée pour ce client. Demande-lui de vérifier le numéro.`
      : "Aucune commande récente trouvée pour ce client."
  }

  // Statut de LIVRAISON fin (transporteur), plus précis que le statut
  // d'expédition Shopify quand il est disponible.
  const deliveryFr = (s: string | null): string | null => {
    switch ((s || '').toUpperCase()) {
      case 'DELIVERED': return 'livrée ✅'
      case 'OUT_FOR_DELIVERY': return 'en cours de livraison (arrive aujourd\'hui)'
      case 'IN_TRANSIT': return 'en transit (en route vers le client)'
      case 'ATTEMPTED_DELIVERY': return 'livraison tentée (le transporteur a essayé de livrer)'
      case 'FAILURE': return 'problème de livraison signalé'
      case 'LABEL_PRINTED':
      case 'READY_FOR_PICKUP': return 'prête, en attente de prise en charge par le transporteur'
      default: return null // pas d'info fine → on retombe sur le statut d'expédition
    }
  }

  // Statut d'EXPÉDITION Shopify (fallback quand le transporteur ne pousse rien).
  const shipFr = (s: string | null): string => {
    switch ((s || '').toUpperCase()) {
      case 'FULFILLED': return 'expédiée'
      case 'PARTIALLY_FULFILLED': return 'partiellement expédiée'
      case 'UNFULFILLED': return 'en préparation (pas encore expédiée)'
      case 'IN_PROGRESS': return 'en cours de traitement'
      case 'ON_HOLD': return 'en attente'
      default: return s || 'statut inconnu'
    }
  }

  const lines = orders.slice(0, 3).map((o) => {
    // On privilégie le statut de livraison fin s'il existe, sinon l'expédition.
    const st = deliveryFr(o.deliveryStatus) || shipFr(o.fulfillmentStatus)
    const track = o.tracking?.url ? ` Suivi : ${o.tracking.url}` : o.tracking?.number ? ` N° de suivi : ${o.tracking.number}` : ''
    const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : ''
    return `Commande ${o.name}${date ? ` (du ${date})` : ''} : ${st}.${track}`
  })

  return `Voici les informations de suivi (transmets-les clairement au client, donne le lien de suivi tel quel s'il existe, n'invente jamais de date de livraison précise, pour la position exacte, invite le client à cliquer le lien de suivi) :\n${lines.join('\n')}`
}

const ACTION_FN_NAMES = new Set(SHOPIFY_ACTION_TOOLS.map((t) => t.function.name))

export function isShopifyActionTool(name: string): boolean {
  return ACTION_FN_NAMES.has(name)
}

export function isNotificationChannelTool(name: string): boolean {
  return name === 'set_notification_channel'
}

/** Enregistre le canal préféré du contact (opt-in conversationnel). */
export async function handleNotificationChannelTool(
  args: { channel?: string; email?: string },
  ctx: { contactId?: string | null }
): Promise<string> {
  if (!ctx.contactId) return 'Impossible d\'enregistrer le canal (contact inconnu).'
  const channel = ['whatsapp', 'email', 'both'].includes(args.channel || '') ? args.channel! : 'whatsapp'

  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await supabase
    .from('contacts')
    .update({
      preferred_channel: channel as 'whatsapp' | 'email' | 'both',
      notify_email: args.email || undefined,
      channel_optin_at: new Date().toISOString(),
    })
    .eq('id', ctx.contactId)

  return `Canal de notification enregistré (${channel}). Confirme au client qu'il sera prévenu sur ce canal pour le suivi de sa commande.`
}

/** L'utilisateur a-t-il une boutique Shopify connectée (pour proposer ces outils) ? */
export async function userHasShopifyStore(userId: string): Promise<boolean> {
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data } = await supabase
    .from('shopify_stores')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * Récupère la boutique active + un access token VALIDE d'un utilisateur.
 *
 * Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou tard
 * un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit ; s'il
 * renvoie null (reconnexion nécessaire), on renvoie null et les appelants
 * dégradent proprement (message « boutique indisponible » à l'agent).
 */
async function getUserStore(userId: string): Promise<{ shop: string; token: string } | null> {
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.shop_domain || !store.access_token) return null
  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    console.error('[shopify/ai-tools] jeton Shopify invalide pour', store.shop_domain,
      '→ rouvrir l’app depuis l’admin Shopify pour la reconnecter')
    return null
  }
  return { shop: store.shop_domain, token }
}

/**
 * Résout un remboursement à partir des args de l'outil : trouve la commande,
 * les articles (si partiel), et le montant remboursable suggéré par Shopify.
 * Partagé par l'estimation (affichage) et le mode auto (garde-fou plafond).
 */
export async function resolveRefundForOrder(
  userId: string,
  args: Record<string, unknown>
): Promise<{ amount: number; currency: string; orderName: string; refundLineItems?: RefundLineItem[] } | null> {
  const store = await getUserStore(userId)
  if (!store) return null
  const orderName = String(args.order_name || '')
  const orderId = await findOrderIdByName(store.shop, store.token, orderName)
  if (!orderId) return null

  const refundType = String(args.refund_type || 'full')
  let refundLineItems: RefundLineItem[] | undefined

  if (refundType === 'partial_items' && Array.isArray(args.line_items)) {
    const order = await getRefundableOrder(store.shop, store.token, orderId)
    if (order) {
      refundLineItems = (args.line_items as { title?: string; quantity?: number }[])
        .map((wanted) => {
          const match = order.lineItems.find((li) => li.title.toLowerCase().includes(String(wanted.title || '').toLowerCase()))
          return match ? { lineItemId: match.id, quantity: Number(wanted.quantity) || match.quantity } : null
        })
        .filter((x): x is RefundLineItem => x !== null)
    }
  } else if (refundType !== 'partial_amount') {
    // Remboursement TOTAL : Shopify renvoie 0 si on n'envoie pas les articles.
    // On résout donc tous les line items de la commande pour l'estimation.
    const order = await getRefundableOrder(store.shop, store.token, orderId)
    if (order && order.lineItems.length > 0) {
      refundLineItems = order.lineItems.map((li) => ({ lineItemId: li.id, quantity: li.quantity }))
    }
  }

  // Pour l'estimation par montant, on demande le suggestedRefund TOTAL (avec
  // articles) puis on plafonne au montant voulu ci-dessous.
  let suggestLineItems = refundLineItems
  if (refundType === 'partial_amount') {
    const order = await getRefundableOrder(store.shop, store.token, orderId)
    if (order && order.lineItems.length > 0) {
      suggestLineItems = order.lineItems.map((li) => ({ lineItemId: li.id, quantity: li.quantity }))
    }
  }

  const suggested = await getSuggestedRefund(store.shop, store.token, orderId, { refundLineItems: suggestLineItems })
  if (!suggested) return null
  if (suggested.amount <= 0) return null

  // Partiel par montant : plafonner au montant demandé (sans dépasser le suggéré).
  let amount = suggested.amount
  if (refundType === 'partial_amount' && args.amount != null) {
    amount = Math.min(Number(args.amount), suggested.amount)
  }
  return { amount, currency: suggested.currency, orderName, refundLineItems }
}

/** Estimation légère du montant remboursable, pour l'afficher avant validation. */
async function estimateRefundAmount(
  userId: string,
  args: Record<string, unknown>
): Promise<{ amount: number; currency: string } | null> {
  try {
    const r = await resolveRefundForOrder(userId, args)
    return r ? { amount: r.amount, currency: r.currency } : null
  } catch {
    return null
  }
}

/**
 * Vérifie l'identité avant un remboursement : le contact doit être relié à un
 * client Shopify (via opt-in Cas 3, ou via link_customer Cas 2) ET la commande
 * demandée doit appartenir à CE client. Sinon on refuse et on demande à l'agent
 * de vérifier l'identité (email + n° de commande).
 */
async function verifyRefundIdentity(
  ctx: { userId: string; conversationId?: string | null },
  orderName: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!ctx.conversationId) return { ok: false, message: "Impossible de vérifier l'identité (conversation inconnue). Demande à un conseiller humain." }

  const supabase = createAdminSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact:contacts(shopify_customer_id)')
    .eq('id', ctx.conversationId)
    .maybeSingle()
  const customerId = (conv?.contact as unknown as { shopify_customer_id: string | null } | null)?.shopify_customer_id || null

  if (!customerId) {
    return { ok: false, message: "Avant tout remboursement, tu DOIS vérifier l'identité du client : demande-lui l'email utilisé pour sa commande et appelle l'outil link_customer. Ne crée PAS de demande de remboursement tant que le compte n'est pas relié." }
  }

  // La commande demandée appartient-elle bien à ce client ?
  const store = await getUserStore(ctx.userId)
  if (!store) return { ok: false, message: "Boutique indisponible pour vérifier la commande. Réessaie plus tard." }
  const orders = await findOrdersByCustomerId(store.shop, store.token, customerId, 50)
  if (orders.ok) {
    const wanted = orderName.replace(/^#?/, '#').toLowerCase()
    const found = orders.data.some((o) => o.name.toLowerCase() === wanted)
    if (!found) {
      return { ok: false, message: `La commande ${orderName} ne figure pas parmi les commandes de ce client. Demande-lui de reconfirmer le numéro exact de sa commande, ne rembourse pas une commande qui n'est pas la sienne.` }
    }
  }
  return { ok: true }
}

/**
 * Traite l'appel d'un outil d'action : crée l'action pending et renvoie un
 * message destiné à l'agent (qui le reformulera au client).
 */
export async function handleActionTool(
  call: ActionToolCall,
  ctx: { userId: string; conversationId?: string | null; contactId?: string | null }
): Promise<string> {
  const args = call.arguments
  let actionType: ActionType
  let summary: string

  if (call.functionName === 'request_cancel_order') {
    actionType = 'cancel_order'
    summary = `Annulation de la commande ${args.order_name}${args.reason ? `, ${args.reason}` : ''}`
  } else if (call.functionName === 'request_refund') {
    actionType = 'refund_order'

    // GARDE-FOU IDENTITÉ (Cas 2 SAV) : un remboursement n'est enregistré QUE si
    // le contact est relié à un client Shopify ET que la commande demandée
    // appartient bien à ce client (email + n° de commande cohérents). Empêche
    // qu'un inconnu se fasse rembourser la commande de quelqu'un d'autre.
    const gate = await verifyRefundIdentity(ctx, String(args.order_name || ''))
    if (!gate.ok) return gate.message

    // Estimer le montant remboursable pour l'afficher avant validation.
    const est = await estimateRefundAmount(ctx.userId, args)
    if (est) {
      args.amount_estimated = est.amount
      args.currency = est.currency
    }
    const amountLabel = est ? `, ${est.amount.toFixed(2)} ${est.currency}` : ''
    summary = `Remboursement ${args.order_name}${amountLabel}${args.reason ? ` (${args.reason})` : ''}`
  } else if (call.functionName === 'request_discount') {
    actionType = 'create_discount'
    const val = args.percentage != null ? `${args.percentage}%` : args.amount != null ? `${args.amount}` : 'à définir'
    summary = `Code de réduction (${val})${args.reason ? `, ${args.reason}` : ''}`
  } else {
    return 'Action inconnue.'
  }

  const res = await createPendingAction({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    contactId: ctx.contactId,
    actionType,
    payload: args,
    summary,
  })

  if (!res.ok) {
    return "La demande n'a pas pu être enregistrée. Propose au client de réessayer ou de contacter un conseiller."
  }
  return "Demande enregistrée. Elle sera validée par l'équipe. Confirme au client que sa demande est bien prise en compte et sera traitée rapidement (sans promettre de délai précis)."
}

