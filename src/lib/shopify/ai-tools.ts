import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { createPendingAction, type ActionType } from './actions'
import { decryptMessage } from '@/lib/crypto/encryption'
import { generateAgentResponse } from '@/lib/openai/client'
import { findOrderIdByName, getRefundableOrder, getSuggestedRefund, type RefundLineItem } from './client'

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
          reason: { type: 'string', description: 'Raison du remboursement (recommandé — sera visible sur Shopify)' },
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

  const statusFr = (s: string | null): string => {
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
    const st = statusFr(o.fulfillmentStatus)
    const track = o.tracking?.url ? ` Suivi : ${o.tracking.url}` : o.tracking?.number ? ` N° de suivi : ${o.tracking.number}` : ''
    const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : ''
    return `Commande ${o.name}${date ? ` (du ${date})` : ''} : ${st}.${track}`
  })

  return `Voici les informations de suivi (transmets-les clairement au client, donne le lien de suivi tel quel s'il existe, n'invente jamais de date de livraison) :\n${lines.join('\n')}`
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

/** Récupère la boutique active + token déchiffré d'un utilisateur. */
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
  return { shop: store.shop_domain, token: decryptMessage(store.access_token) }
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
  }

  const suggested = await getSuggestedRefund(store.shop, store.token, orderId, { refundLineItems })
  if (!suggested) return null

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
    summary = `Annulation de la commande ${args.order_name}${args.reason ? ` — ${args.reason}` : ''}`
  } else if (call.functionName === 'request_refund') {
    actionType = 'refund_order'
    // Estimer le montant remboursable pour l'afficher avant validation.
    const est = await estimateRefundAmount(ctx.userId, args)
    if (est) {
      args.amount_estimated = est.amount
      args.currency = est.currency
    }
    const amountLabel = est ? ` — ${est.amount.toFixed(2)} ${est.currency}` : ''
    summary = `Remboursement ${args.order_name}${amountLabel}${args.reason ? ` (${args.reason})` : ''}`
  } else if (call.functionName === 'request_discount') {
    actionType = 'create_discount'
    const val = args.percentage != null ? `${args.percentage}%` : args.amount != null ? `${args.amount}` : 'à définir'
    summary = `Code de réduction (${val})${args.reason ? ` — ${args.reason}` : ''}`
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

/**
 * MODE REMBOURSEMENT AUTOMATIQUE (opt-in par agent).
 *
 * Tente d'exécuter un remboursement SANS validation humaine, sous garde-fous :
 *  1) Montant remboursable calculé via Shopify (getSuggestedRefund).
 *  2) GARDE-FOU DUR : si montant > plafond (maxAmount) ou non calculable → on
 *     abandonne l'auto (return null → l'appelant retombe sur le pending manuel).
 *  3) DOUBLE VALIDATION IA : 2e passe indépendante qui vérifie que la situation
 *     respecte les règles du marchand. Défaut refus si doute.
 *  4) Si tout passe : action créée déjà `confirmed`, exécutée immédiatement, +
 *     alerte in-app (journalisation) pour le marchand.
 *
 * Retourne le message à donner à l'agent, ou `null` pour laisser le flux manuel
 * prendre le relais (aucune décision auto prise).
 */
export async function handleAutoRefund(
  call: ActionToolCall,
  ctx: {
    userId: string
    conversationId?: string | null
    rules: string
    maxAmount: number | null
    chatMessages: { role: string; content: string }[]
  }
): Promise<string | null> {
  const args = call.arguments

  // 1. Montant remboursable réel.
  const resolved = await resolveRefundForOrder(ctx.userId, args)
  if (!resolved) return null // non calculable → manuel

  // 2. Garde-fou dur sur le plafond (JAMAIS outrepassé par l'IA).
  if (ctx.maxAmount != null && resolved.amount > ctx.maxAmount) return null

  // 3. Double validation IA (2e passe indépendante).
  const conv = ctx.chatMessages.slice(-12).map((m) => `[${m.role}] ${m.content}`).join('\n')
  const check = await generateAgentResponse({
    model: 'gpt-4o-mini',
    temperature: 0,
    systemPrompt: `Tu es un contrôleur de remboursement. Tu décides si un remboursement automatique peut être exécuté SANS validation humaine, en te basant STRICTEMENT sur les règles du marchand.

RÈGLES DU MARCHAND :
${ctx.rules || '(aucune règle définie — refuse par défaut)'}

DEMANDE : commande ${resolved.orderName}, montant ${resolved.amount.toFixed(2)} ${resolved.currency}, raison invoquée : ${args.reason || 'non précisée'}.

CONVERSATION (derniers messages) :
${conv}

Réponds UNIQUEMENT en JSON : { "approve": true|false, "reason": "courte justification" }
Règle d'or : en cas de doute, d'ambiguïté, de règle non satisfaite, ou si aucune règle n'est définie → approve:false.`,
    messages: [{ role: 'user', content: 'Ce remboursement respecte-t-il les règles ? Réponds en JSON.' }],
  })

  let approve = false
  if (check.ok && check.content) {
    try {
      const m = check.content.match(/\{[\s\S]*\}/)
      if (m) approve = JSON.parse(m[0]).approve === true
    } catch { /* défaut refus */ }
  }
  if (!approve) return null // pas validé → manuel

  // 4. Créer l'action déjà confirmée + exécuter.
  args.refund_auto = true
  args.amount_estimated = resolved.amount
  args.currency = resolved.currency
  const summary = `Remboursement AUTO ${resolved.orderName} — ${resolved.amount.toFixed(2)} ${resolved.currency}${args.reason ? ` (${args.reason})` : ''}`

  const created = await createPendingAction({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    actionType: 'refund_order',
    payload: args,
    summary,
    autoConfirm: true,
  })
  if (!created.ok || !created.id) return null // échec insert → manuel

  const { executeAction } = await import('./actions')
  const exec = await executeAction(created.id)

  // Journalisation : alerte in-app quel que soit le résultat.
  const supabase = createAdminSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await supabase.from('user_alerts').insert({
    user_id: ctx.userId,
    alert_type: 'refund_auto',
    title: exec.ok ? 'Remboursement automatique effectué' : 'Remboursement automatique échoué',
    message: exec.ok
      ? `L'agent IA a remboursé ${resolved.amount.toFixed(2)} ${resolved.currency} sur la commande ${resolved.orderName}${args.reason ? ` (${args.reason})` : ''}.`
      : `Tentative de remboursement auto sur ${resolved.orderName} échouée : ${exec.error || 'erreur'}.`,
    metadata: { order: resolved.orderName, amount: resolved.amount, currency: resolved.currency, action_id: created.id },
  }).then(() => {}, () => {})

  if (!exec.ok) {
    return "Le remboursement automatique n'a pas pu aboutir. Dis au client que sa demande est prise en compte et sera traitée par l'équipe."
  }
  return `Remboursement de ${resolved.amount.toFixed(2)} ${resolved.currency} effectué automatiquement sur la commande ${resolved.orderName}. Confirme au client que son remboursement a bien été traité.`
}
