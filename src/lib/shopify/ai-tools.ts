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

const ACTION_FN_NAMES = new Set(SHOPIFY_ACTION_TOOLS.map((t) => t.function.name))

export function isShopifyActionTool(name: string): boolean {
  return ACTION_FN_NAMES.has(name)
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
