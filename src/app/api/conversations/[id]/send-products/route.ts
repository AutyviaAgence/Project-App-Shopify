import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * POST /api/conversations/[id]/send-products
 * Envoie un message PRODUIT (catalogue Meta) dans une conversation :
 *  - 1 produit  → fiche produit unique
 *  - N produits → multi-product message (le client parcourt + ajoute au panier)
 *
 * Body :
 *   { product_retailer_ids: string[], body_text: string, header_text?: string,
 *     footer_text?: string, section_title?: string }
 *
 * Message INTERACTIF (pas un template) → autorisé uniquement DANS la fenêtre 24h.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const productIds: string[] = Array.isArray(body.product_retailer_ids)
    ? body.product_retailer_ids.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim())
    : []
  const bodyText: string = (body.body_text || '').trim()
  const headerText: string = (body.header_text || 'Nos produits').trim()
  const footerText: string | undefined = body.footer_text?.trim() || undefined
  const sectionTitle: string = (body.section_title || 'Produits').trim()

  if (productIds.length === 0) {
    return NextResponse.json({ error: 'Au moins un produit est requis.' }, { status: 400 })
  }
  if (!bodyText) {
    return NextResponse.json({ error: 'Un message d’accompagnement est requis.' }, { status: 400 })
  }

  // Conversation + contact + session
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id, contact_id')
    .eq('id', id)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number')
    .eq('id', conv.contact_id)
    .maybeSingle()
  if (!contact?.phone_number) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_phone_number_id, waba_access_token, waba_catalog_id')
    .eq('id', conv.session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session?.waba_phone_number_id || !session.waba_access_token) {
    return NextResponse.json({ error: 'Session WhatsApp non configurée' }, { status: 400 })
  }
  if (!session.waba_catalog_id) {
    return NextResponse.json({ error: 'Aucun catalogue Meta configuré. Renseignez-le dans les réglages (ID du catalogue Commerce Manager).' }, { status: 400 })
  }

  const token = decryptMessage(session.waba_access_token)
  const catalogId = session.waba_catalog_id

  // Envoi : 1 produit → fiche unique ; sinon liste multi-produit.
  const res = productIds.length === 1
    ? await wabaClient.sendSingleProduct(session.waba_phone_number_id, token, contact.phone_number, {
        catalogId, productRetailerId: productIds[0], bodyText, footerText,
      })
    : await wabaClient.sendProductList(session.waba_phone_number_id, token, contact.phone_number, {
        catalogId, headerText, bodyText, footerText,
        sections: [{ title: sectionTitle.slice(0, 24), productRetailerIds: productIds.slice(0, 30) }],
      })

  if (!res.ok) {
    return NextResponse.json({ error: `Échec de l’envoi : ${res.error.slice(0, 200)}` }, { status: 502 })
  }

  // Trace inbox (message sortant).
  const { encryptMessage } = await import('@/lib/crypto/encryption')
  const preview = productIds.length === 1 ? '🛍️ Produit envoyé' : `🛍️ ${productIds.length} produits envoyés`
  const waMessageId = res.data?.messages?.[0]?.id || null
  await supabase.from('messages').insert({
    conversation_id: conv.id,
    session_id: session.id,
    direction: 'outbound',
    content: encryptMessage(`${preview} : ${bodyText}`),
    message_type: 'text',
    wa_message_id: waMessageId,
    sent_by: 'user',
    status: 'sent',
    ai_processed: true,
  })
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), last_message_preview: preview })
    .eq('id', conv.id)

  return NextResponse.json({ data: { sent: productIds.length, wa_message_id: waMessageId } })
}
