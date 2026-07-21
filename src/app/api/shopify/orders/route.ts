import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/shopify/token'
import { findOrdersByNames, findOrdersByCustomer, findOrdersByCustomerId } from '@/lib/shopify/client'

/**
 * GET /api/shopify/orders?contact_id=xxx
 * Récupère les commandes Shopify récentes du contact (par email/téléphone),
 * pour afficher le contexte client à côté d'une conversation.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const contactId = req.nextUrl.searchParams.get('contact_id')
  if (!contactId) return NextResponse.json({ error: 'contact_id requis' }, { status: 400 })

  // Boutique Shopify de l'utilisateur
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.shop_domain || !store.access_token) {
    return NextResponse.json({ data: { connected: false, orders: [] } })
  }

  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit.
  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    return NextResponse.json(
      { error: 'Jeton Shopify invalide — rouvrez l\'application depuis l\'admin Shopify pour la reconnecter' },
      { status: 502 }
    )
  }

  // Contact (téléphone) + email + lien client Shopify éventuel
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, notify_email, email, name, shopify_customer_id')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return NextResponse.json({ data: { connected: true, orders: [] } })

  // ⚠️ SOURCE DE VÉRITÉ : notre table `shopify_orders`, qui porte le contact_id
  // RÉEL établi à la réception du webhook.
  //
  // Interroger Shopify par `customer_id` paraissait fiable, mais Shopify
  // REGROUPE sous un même client des commandes passées avec le même email —
  // même si, chez nous, elles appartiennent à des contacts WhatsApp distincts.
  // Le panneau affichait alors TOUTES les commandes dans chaque conversation,
  // alors que le tableau (qui lit cette table) était juste.
  //
  // On récupère donc d'abord les numéros de commande rattachés à CE contact et
  // on s'en sert pour filtrer la réponse Shopify (qui reste nécessaire pour le
  // suivi, les remboursements et les statuts à jour).
  // `shopify_orders` n'est pas dans les types générés → cast (même motif que
  // api/shopify/sales et api/shopify/backfill-orders).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: localOrders } = await (supabase as any)
    .from('shopify_orders')
    .select('order_number')
    .eq('contact_id', contactId)
  // `order_number` est stocké avec ou sans « # » selon la source : on compare
  // sur les chiffres seuls pour ne dépendre d'aucun format.
  const allowed = new Set<string>(
    (localOrders || [])
      .map((o: { order_number?: string | number }) => String(o.order_number ?? '').replace(/\D/g, ''))
      .filter(Boolean)
  )
  // Le filtre s'applique sur une liste LARGE (30) : la troncature d'affichage
  // vient donc APRÈS, sinon les commandes du contact — plus anciennes que les
  // dernières de la boutique — étaient coupées avant d'être reconnues.
  const restrict = (orders: { name: string }[]) =>
    (allowed.size === 0 ? orders : orders.filter((o) => allowed.has(String(o.name).replace(/\D/g, ''))))
      .slice(0, 10)

  // ⚠️ CHEMIN PRIVILÉGIÉ : nos numéros de commande.
  //
  // `customer.orders` manque les commandes passées en checkout INVITÉ (Shopify
  // les rattache à un autre `customer`) : #1058 était en base avec le bon
  // contact, mais absente de la réponse Shopify. Notre table fait autorité sur
  // le rattachement — on demande donc à Shopify exactement NOS commandes, et il
  // ne sert plus qu'à fournir statuts, suivi et remboursements à jour.
  if (allowed.size > 0) {
    const byName = await findOrdersByNames(store.shop_domain, token, [...allowed])
    if (byName.ok && byName.data.length > 0) {
      return NextResponse.json({ data: { connected: true, orders: byName.data.slice(0, 10), shopDomain: store.shop_domain, linked: true } })
    }
  }

  // Si le contact est RELIÉ à un client Shopify → recherche fiable par
  // customer_id (pas de faux positifs). C'est le chemin privilégié.
  if (contact.shopify_customer_id) {
    const byId = await findOrdersByCustomerId(store.shop_domain, token, contact.shopify_customer_id)
    if (byId.ok) {
      return NextResponse.json({ data: { connected: true, orders: restrict(byId.data), shopDomain: store.shop_domain, linked: true } })
    }
    // En cas d'échec (client supprimé côté Shopify), on retombe sur email/tel.
  }

  // ROBUSTESSE : le champ phone_number peut contenir un email (données WhatsApp
  // Email, ou import). On ne construit une clause phone Shopify QUE si c'est un
  // vrai numéro (assez de chiffres) — sinon la requête devient `phone:+` et
  // matche TOUTES les commandes de la boutique.
  const rawPhone = (contact.phone_number || '').trim()
  const digits = rawPhone.replace(/\D/g, '')
  const looksLikePhone = !rawPhone.includes('@') && digits.length >= 6
  const phone = looksLikePhone ? `+${digits}` : null

  // Email : notify_email en priorité, sinon email du contact, sinon le
  // phone_number s'il contient en réalité un email.
  const emailFromPhone = rawPhone.includes('@') ? rawPhone : null
  const email = contact.notify_email || contact.email || emailFromPhone || null

  // Si on n'a NI numéro valide NI email, on n'interroge pas Shopify (éviter de
  // tout ramener). Retour vide explicite.
  if (!phone && !email) {
    return NextResponse.json({ data: { connected: true, orders: [], shopDomain: store.shop_domain } })
  }

  const result = await findOrdersByCustomer(store.shop_domain, token, {
    email,
    phone,
  })

  if (!result.ok) {
    return NextResponse.json({ data: { connected: true, orders: [], error: result.error, shopDomain: store.shop_domain } })
  }
  return NextResponse.json({ data: { connected: true, orders: restrict(result.data), shopDomain: store.shop_domain } })
}
