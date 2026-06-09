import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { createPendingAction, type ActionType } from './actions'

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
        "Enregistre une demande de REMBOURSEMENT quand le client le demande. Ne rembourse pas directement : un humain validera. Réponds ensuite au client que sa demande est prise en compte.",
      parameters: {
        type: 'object',
        properties: {
          order_name: { type: 'string', description: "Numéro de commande, ex: #1024" },
          reason: { type: 'string', description: 'Raison du remboursement (optionnel)' },
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
    summary = `Remboursement de la commande ${args.order_name}${args.reason ? ` — ${args.reason}` : ''}`
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
