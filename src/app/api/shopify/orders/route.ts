import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptMessage } from '@/lib/crypto/encryption'
import { findOrdersByCustomer } from '@/lib/shopify/client'

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

  // Contact (téléphone) + email éventuel
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, notify_email, email, name')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return NextResponse.json({ data: { connected: true, orders: [] } })

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

  const result = await findOrdersByCustomer(store.shop_domain, decryptMessage(store.access_token), {
    email,
    phone,
  })

  if (!result.ok) {
    return NextResponse.json({ data: { connected: true, orders: [], error: result.error, shopDomain: store.shop_domain } })
  }
  return NextResponse.json({ data: { connected: true, orders: result.data, shopDomain: store.shop_domain } })
}
