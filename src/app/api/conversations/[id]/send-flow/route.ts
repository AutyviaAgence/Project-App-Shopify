import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage, encryptMessage } from '@/lib/crypto/encryption'
import type { FlowScreen } from '@/types/database'

/**
 * POST /api/conversations/[id]/send-flow
 * Envoie un Flow (formulaire) publié dans une conversation (fenêtre 24h).
 * Body : { flow_id }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const flowDbId = body.flow_id as string | undefined
  if (!flowDbId) return NextResponse.json({ error: 'flow_id requis' }, { status: 400 })

  const { data: flow } = await supabase
    .from('whatsapp_flows')
    .select('id, name, cta_text, body_text, screens, meta_flow_id, status')
    .eq('id', flowDbId).eq('user_id', user.id).maybeSingle()
  if (!flow) return NextResponse.json({ error: 'Flow introuvable' }, { status: 404 })
  if (flow.status !== 'published' || !flow.meta_flow_id) {
    return NextResponse.json({ error: 'Ce formulaire doit être publié avant de pouvoir être envoyé.' }, { status: 400 })
  }
  const screens = (Array.isArray(flow.screens) ? flow.screens : []) as FlowScreen[]
  const firstScreen = screens.find((s) => s.fields.length > 0)
  if (!firstScreen) return NextResponse.json({ error: 'Ce formulaire n’a aucun écran.' }, { status: 422 })

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id, contact_id')
    .eq('id', id).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

  const { data: contact } = await supabase.from('contacts').select('phone_number').eq('id', conv.contact_id).maybeSingle()
  if (!contact?.phone_number) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_phone_number_id, waba_access_token')
    .eq('id', conv.session_id).eq('user_id', user.id).maybeSingle()
  if (!session?.waba_phone_number_id || !session.waba_access_token) {
    return NextResponse.json({ error: 'Session WhatsApp non configurée' }, { status: 400 })
  }
  const token = decryptMessage(session.waba_access_token)

  const res = await wabaClient.sendFlow(session.waba_phone_number_id, token, contact.phone_number, {
    flowId: flow.meta_flow_id,
    ctaText: flow.cta_text || 'Ouvrir',
    bodyText: flow.body_text || flow.name,
    firstScreenId: firstScreen.id,
  })
  if (!res.ok) return NextResponse.json({ error: `Échec de l’envoi : ${res.error.slice(0, 200)}` }, { status: 502 })

  const preview = `📋 Formulaire : ${flow.name}`
  const waMessageId = res.data?.messages?.[0]?.id || null
  await supabase.from('messages').insert({
    conversation_id: conv.id,
    session_id: session.id,
    direction: 'outbound',
    content: encryptMessage(preview),
    message_type: 'text',
    wa_message_id: waMessageId,
    sent_by: 'user',
    status: 'sent',
    ai_processed: true,
  })
  await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: preview }).eq('id', conv.id)

  return NextResponse.json({ data: { wa_message_id: waMessageId } })
}
