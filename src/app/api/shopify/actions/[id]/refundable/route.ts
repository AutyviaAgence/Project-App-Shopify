import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptMessage } from '@/lib/crypto/encryption'
import { findOrderIdByName, getRefundableOrder } from '@/lib/shopify/client'

/**
 * GET /api/shopify/actions/[id]/refundable
 * Détails de la commande d'une action de remboursement en attente : total, déjà
 * remboursé, montant remboursable, articles. Sert à pré-remplir + afficher le
 * contexte dans le formulaire de validation.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: action } = await supabase
    .from('shopify_actions')
    .select('action_type, payload')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!action || action.action_type !== 'refund_order') {
    return NextResponse.json({ error: 'Action introuvable' }, { status: 404 })
  }

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.shop_domain || !store.access_token) {
    return NextResponse.json({ error: 'Boutique non connectée' }, { status: 400 })
  }

  const token = decryptMessage(store.access_token)
  const orderName = String((action.payload as Record<string, unknown>).order_name || '')
  const orderId = await findOrderIdByName(store.shop_domain, token, orderName)
  if (!orderId) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })

  const order = await getRefundableOrder(store.shop_domain, token, orderId)
  if (!order) return NextResponse.json({ error: 'Commande non remboursable' }, { status: 404 })

  return NextResponse.json({
    data: {
      name: order.name,
      currency: order.currency,
      total: order.total,
      totalRefunded: order.totalRefunded,
      refundableAmount: order.refundableAmount,
      lineItems: order.lineItems.map((li) => ({ title: li.title, quantity: li.quantity, unitPrice: li.unitPrice })),
    },
  })
}
