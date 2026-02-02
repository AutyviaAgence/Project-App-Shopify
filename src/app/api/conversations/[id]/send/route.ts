import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'
import { encryptMessage } from '@/lib/crypto/encryption'
import { canAccessSession } from '@/lib/teams/access'

/** POST /api/conversations/[id]/send — Envoyer un message */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const content = body.content as string

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  }

  if (content.length > 4096) {
    return NextResponse.json({ error: 'Message trop long (max 4096)' }, { status: 400 })
  }

  // Récupérer la conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // Récupérer la session
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', conversation.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Vérifier l'accès (propriétaire ou membre avec permissions)
  const hasAccess = await canAccessSession(supabase, user.id, session)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier la permission can_send_messages pour les ressources d'équipe
  if (session.team_id && session.user_id !== user.id) {
    const { checkTeamPermission } = await import('@/lib/teams/access')
    const canSendMessages = await checkTeamPermission(supabase, user.id, session.team_id, 'messages_send')
    if (!canSendMessages) {
      return NextResponse.json({ error: 'Permission d\'envoi de messages refusée' }, { status: 403 })
    }
  }

  if (session.status !== 'connected') {
    return NextResponse.json({ error: 'Session non connectée' }, { status: 400 })
  }

  // Récupérer le contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', conversation.contact_id)
    .single()

  if (!contact?.phone_number) {
    return NextResponse.json({ error: 'Contact sans numéro' }, { status: 400 })
  }

  // Envoyer via Evolution API
  const evoResult = await evolution.sendText(
    session.instance_name,
    contact.phone_number,
    content.trim()
  )

  if (!evoResult.ok) {
    return NextResponse.json({ error: evoResult.error }, { status: 502 })
  }

  // Sauvegarder en BDD (chiffré si clé configurée)
  const encryptedContent = encryptMessage(content.trim())

  const { data: message, error: dbError } = await supabase
    .from('messages')
    .insert({
      conversation_id: id,
      session_id: session.id,
      direction: 'outbound',
      content: encryptedContent,
      message_type: 'text',
      sent_by: 'user',
      status: 'sent',
    })
    .select()
    .single()

  if (dbError) {
    console.warn('[Send] Message envoyé mais erreur DB:', dbError.message)
    return NextResponse.json({
      data: { sent: true },
      warning: 'Message envoyé mais non sauvegardé en base',
    })
  }

  // Mettre à jour la conversation
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.trim().slice(0, 100),
    })
    .eq('id', id)

  // Retourner le message avec le contenu en clair (pas chiffré) pour l'affichage
  return NextResponse.json({
    data: {
      ...message,
      content: content.trim()
    }
  })
}
