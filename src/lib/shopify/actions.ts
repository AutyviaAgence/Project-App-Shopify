import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'
import {
  findOrderIdByName,
  cancelOrder,
  refundOrder,
  createDiscountCode,
  getRefundableOrder,
  type RefundLineItem,
} from './client'

/**
 * Système d'actions Shopify avec validation humaine.
 *
 * L'IA n'exécute JAMAIS d'action write. Elle crée une action "pending"
 * (createPendingAction) ; un humain la valide depuis Xeyo, ce qui déclenche
 * executeAction (qui appelle réellement l'Admin API).
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type ActionType = 'cancel_order' | 'refund_order' | 'create_discount'

/**
 * Crée une action de validation (appelé par l'agent IA).
 * `autoConfirm` = mode remboursement automatique : l'action est créée déjà
 * `confirmed` (l'appelant enchaîne executeAction). Défaut : pending (manuel).
 */
export async function createPendingAction(params: {
  userId: string
  conversationId?: string | null
  contactId?: string | null
  actionType: ActionType
  payload: Record<string, unknown>
  summary: string
  autoConfirm?: boolean
}): Promise<{ ok: boolean; id?: string }> {
  const supabase = admin()

  // Retrouver la boutique de l'utilisateur
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id')
    .eq('user_id', params.userId)
    .eq('is_active', true)
    .maybeSingle()

  const { data, error } = await supabase
    .from('shopify_actions')
    .insert({
      user_id: params.userId,
      store_id: store?.id ?? null,
      conversation_id: params.conversationId ?? null,
      contact_id: params.contactId ?? null,
      action_type: params.actionType,
      payload: params.payload,
      summary: params.summary,
      status: params.autoConfirm ? 'confirmed' : 'pending',
      ...(params.autoConfirm ? { reviewed_at: new Date().toISOString() } : {}),
    })
    .select('id')
    .single()

  if (error) return { ok: false }
  return { ok: true, id: data.id }
}

/**
 * Exécute une action confirmée par un humain (appelé depuis l'API de validation).
 * Récupère la boutique + token, appelle l'Admin API selon le type d'action.
 */
export async function executeAction(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = admin()

  const { data: action } = await supabase
    .from('shopify_actions')
    .select('*')
    .eq('id', actionId)
    .single()

  if (!action) return { ok: false, error: 'Action introuvable' }
  if (action.status !== 'confirmed') return { ok: false, error: 'Action non confirmée' }

  // Récupérer la boutique + token
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('id', action.store_id)
    .maybeSingle()

  if (!store?.shop_domain || !store.access_token) {
    await markFailed(actionId, 'Boutique ou token introuvable')
    return { ok: false, error: 'Boutique introuvable' }
  }

  const shop = store.shop_domain
  const token = decryptMessage(store.access_token)
  const payload = action.payload as Record<string, unknown>

  try {
    let result: { ok: true; data: unknown } | { ok: false; error: string }

    if (action.action_type === 'cancel_order' || action.action_type === 'refund_order') {
      const orderName = String(payload.order_name || payload.order || '')
      const orderId = await findOrderIdByName(shop, token, orderName)
      if (!orderId) {
        await markFailed(actionId, `Commande ${orderName} introuvable`)
        return { ok: false, error: 'Commande introuvable' }
      }
      if (action.action_type === 'cancel_order') {
        result = await cancelOrder(shop, token, orderId)
      } else {
        // Remboursement : note = raison du client, partiel selon le payload.
        const note = String(payload.reason || payload.note || '')
        const refundType = String(payload.refund_type || 'full')
        let refundLineItems: RefundLineItem[] | undefined
        // Partiel par articles : l'IA a décrit des articles → on résout les IDs.
        if (refundType === 'partial_items' && Array.isArray(payload.line_items)) {
          const order = await getRefundableOrder(shop, token, orderId)
          if (order) {
            refundLineItems = (payload.line_items as { title?: string; quantity?: number }[])
              .map((wanted) => {
                const match = order.lineItems.find(
                  (li) => li.title.toLowerCase().includes(String(wanted.title || '').toLowerCase())
                )
                return match ? { lineItemId: match.id, quantity: Number(wanted.quantity) || match.quantity } : null
              })
              .filter((x): x is RefundLineItem => x !== null)
          }
        }
        // Montant : soit un montant explicite saisi à la validation
        // (refund_amount), soit le montant partiel de la demande initiale.
        const amount = payload.refund_amount != null
          ? Number(payload.refund_amount)
          : (refundType === 'partial_amount' && payload.amount != null ? Number(payload.amount) : undefined)
        // Méthode choisie à la validation (défaut : moyen d'origine).
        const method = (payload.refund_method as 'original' | 'store_credit' | 'both' | undefined) || 'original'
        const storeCreditAmount = payload.store_credit_amount != null ? Number(payload.store_credit_amount) : undefined
        result = await refundOrder(shop, token, orderId, { note, refundLineItems, amount, method, storeCreditAmount })
      }
    } else if (action.action_type === 'create_discount') {
      result = await createDiscountCode(shop, token, {
        code: String(payload.code || `XEYO${Date.now().toString().slice(-5)}`),
        percentage: payload.percentage != null ? Number(payload.percentage) : undefined,
        amount: payload.amount != null ? Number(payload.amount) : undefined,
      })
    } else {
      await markFailed(actionId, 'Type d\'action inconnu')
      return { ok: false, error: 'Type inconnu' }
    }

    if (!result.ok) {
      await markFailed(actionId, result.error)
      return { ok: false, error: result.error }
    }

    await supabase
      .from('shopify_actions')
      .update({ status: 'executed', result: result.data as Record<string, unknown>, executed_at: new Date().toISOString() })
      .eq('id', actionId)

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur'
    await markFailed(actionId, msg)
    return { ok: false, error: msg }
  }
}

async function markFailed(actionId: string, error: string) {
  await admin()
    .from('shopify_actions')
    .update({ status: 'failed', error_message: error })
    .eq('id', actionId)
}
