import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { getShopifyConfig, getAppPurchaseOneTimeStatus } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { creditOneTimePack, ONE_TIME_PACKS, type PackId } from '@/lib/shopify/billing'

/**
 * GET /api/shopify/billing/purchase/callback?shop=…&id=<uuid interne>
 *
 * Shopify y renvoie le marchand après qu'il a approuvé (ou refusé) l'achat.
 *
 * ⚠️ NE JAMAIS CROIRE CETTE URL.
 *
 * Elle est entièrement manipulable : le marchand la voit dans sa barre d'adresse
 * et peut la rejouer, la modifier, la partager. Créditer sur sa seule foi
 * reviendrait à distribuer des tokens gratuits à qui sait recharger une page.
 *
 * Deux garde-fous, dans cet ordre :
 *
 *   1. On REDEMANDE à Shopify si l'achat est bien `ACTIVE`. C'est la seule
 *      source de vérité. Un identifiant forgé ne passera pas.
 *   2. Le crédit lui-même est idempotent (verrou optimiste en base) : même un
 *      rejeu d'une URL parfaitement valide ne crédite qu'une fois.
 */
export async function GET(req: NextRequest) {
  const { appUrl } = getShopifyConfig()
  const shop = req.nextUrl.searchParams.get('shop') || ''
  const purchaseId = req.nextUrl.searchParams.get('id') || ''

  const back = (params: string) => NextResponse.redirect(`${appUrl}/subscription?${params}`)

  if (!shop || !purchaseId) return back('purchase=error')

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Tout se relit en base : le pack, le marchand, le montant. L'URL ne porte
  // qu'un identifiant opaque — elle ne dit rien de ce qui doit être crédité.
  const { data: purchase } = await admin
    .from('shopify_one_time_purchases')
    .select('id, user_id, shop_domain, pack, status, charge_id')
    .eq('id', purchaseId)
    .maybeSingle()

  if (!purchase) return back('purchase=error')

  // Le marchand revient sur une page déjà traitée (bouton retour, rafraîchissement) :
  // on lui montre le succès, sans rien recréditer.
  if (purchase.status === 'credited') return back('purchase=success')

  // La boutique de l'URL doit être celle de l'achat : sans ce contrôle, on
  // interrogerait Shopify avec le jeton d'une AUTRE boutique.
  if (purchase.shop_domain !== shop) return back('purchase=error')

  if (!purchase.charge_id) return back('purchase=error')

  const token = await getValidAccessToken(shop)
  if (!token) return back('purchase=error')

  // ── LE CONTRÔLE QUI COMPTE ────────────────────────────────────────────────
  // On demande à Shopify, pas au navigateur du marchand.
  const status = await getAppPurchaseOneTimeStatus(shop, token, purchase.charge_id)

  if (!status || status.status !== 'ACTIVE') {
    await admin
      .from('shopify_one_time_purchases')
      .update({ status: 'declined' })
      .eq('id', purchase.id)
      .eq('status', 'pending')

    console.log('[billing/purchase/callback]', shop, '→ achat non approuvé:', status?.status ?? 'introuvable')
    return back('purchase=declined')
  }

  // Paiement confirmé par Shopify. Le crédit est idempotent : un rejeu ne
  // crédite pas deux fois.
  const credited = await creditOneTimePack(purchase.id, purchase.charge_id)

  if (!credited.ok) {
    if (credited.alreadyCredited) return back('purchase=success')
    console.error('[billing/purchase/callback] crédit échoué:', credited.error)
    return back('purchase=error')
  }

  const pack = ONE_TIME_PACKS[purchase.pack as PackId]

  // Trace visible par le marchand (best-effort : ne doit jamais faire échouer
  // un crédit déjà accordé).
  try {
    await admin.from('user_alerts').insert({
      user_id: purchase.user_id,
      alert_type: 'info',
      title: 'Achat confirmé',
      message: `${pack.label} : c’est ajouté à votre compte.`,
      metadata: { type: 'one_time_purchase', pack: purchase.pack, amount: credited.amount },
    })
  } catch (e) {
    console.error('[billing/purchase/callback] alerte non créée (non bloquant):', e)
  }

  console.log('[billing/purchase/callback]', shop, '→ crédité:', purchase.pack)
  return back('purchase=success')
}
