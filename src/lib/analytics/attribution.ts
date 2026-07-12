import 'server-only'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'

/**
 * Attribution du CA (last-touch bornée) : quand une commande Shopify arrive, on
 * l'attribue au DERNIER message WhatsApp d'automatisation/campagne envoyé au
 * contact dans une fenêtre (défaut 7 jours). On enregistre le montant → permet
 * « X € générés » et un ROAS par campagne/automatisation.
 *
 * Idempotent (UNIQUE user_id+shopify_order_id) : une commande n'est attribuée
 * qu'une fois. Best-effort : ne jette jamais (les stats ne cassent pas le webhook).
 */

const ATTRIBUTION_WINDOW_HOURS = (() => {
  const v = Number(process.env.ATTRIBUTION_WINDOW_HOURS)
  return Number.isFinite(v) && v > 0 ? v : 24 * 7 // 7 jours par défaut
})()

export async function attributeOrder(params: {
  userId: string
  contactId: string | null
  shopifyOrderId: string
  amount: number
  currency: string | null
  orderedAt: string
}): Promise<void> {
  const { userId, contactId, shopifyOrderId, amount, currency, orderedAt } = params
  if (!contactId || !shopifyOrderId) return
  try {
    const supabase = getAdminSupabase()

    // Déjà attribuée ? (idempotence explicite avant de chercher le message).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('attributed_conversions')
      .select('id')
      .eq('user_id', userId)
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle()
    if (existing) return

    const orderTime = new Date(orderedAt).getTime()
    const since = new Date(orderTime - ATTRIBUTION_WINDOW_HOURS * 3600_000).toISOString()

    // Conversations du contact → dernier message SORTANT rattaché à une
    // automatisation OU une campagne, dans la fenêtre [order - N h ; order].
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convs } = await (supabase as any)
      .from('conversations').select('id').eq('contact_id', contactId)
    const convIds = (convs || []).map((c: { id: string }) => c.id)
    if (convIds.length === 0) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msgs } = await (supabase as any)
      .from('messages')
      .select('id, automation_id, campaign_id, created_at')
      .in('conversation_id', convIds)
      .eq('direction', 'outbound')
      .or('automation_id.not.is.null,campaign_id.not.is.null')
      .gte('created_at', since)
      .lte('created_at', orderedAt)
      .order('created_at', { ascending: false })
      .limit(1)

    const msg = (msgs || [])[0] as { id: string; automation_id: string | null; campaign_id: string | null; created_at: string } | undefined
    if (!msg) return // aucune source WhatsApp dans la fenêtre → commande non attribuée

    const hoursToOrder = Math.max(0, (orderTime - new Date(msg.created_at).getTime()) / 3600_000)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('attributed_conversions')
      .upsert({
        user_id: userId,
        automation_id: msg.automation_id,
        campaign_id: msg.campaign_id,
        contact_id: contactId,
        shopify_order_id: shopifyOrderId,
        amount: Number.isFinite(amount) ? amount : 0,
        currency,
        message_id: msg.id,
        hours_to_order: Math.round(hoursToOrder * 10) / 10,
      }, { onConflict: 'user_id,shopify_order_id', ignoreDuplicates: true })
  } catch (err) {
    console.error('[attribution] échec attribution commande:', err)
  }
}
