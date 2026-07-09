import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { sendMessage, sendMediaMessage } from '@/lib/messaging/send'
import { getConversationWindow } from '@/lib/whatsapp-cloud/window'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { uploadMedia } from '@/lib/storage/media'

/**
 * Detect if a send error indicates the WhatsApp session is disconnected.
 * If so, update session status to 'disconnected' and create a user alert.
 */
async function handleDisconnectedSession(
  error: string,
  session: { id: string; user_id: string; instance_name: string; status: string }
): Promise<boolean> {
  const disconnectPatterns = [
    'Connection Closed',
    'connection closed',
    'Unauthorized',
    'not connected',
    'instance not found',
    'QR code not read',
  ]

  const isDisconnected = disconnectPatterns.some(p => error.includes(p))
  if (!isDisconnected || session.status === 'disconnected') return false

  const adminSupabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await adminSupabase.from('whatsapp_sessions').update({ status: 'disconnected' }).eq('id', session.id)

  // Only create alert if none already exists for this session today
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { data: existingAlert } = await adminSupabase
    .from('user_alerts')
    .select('id')
    .eq('user_id', session.user_id)
    .eq('alert_type', 'session_disconnected')
    .contains('metadata', { session_id: session.id })
    .gte('created_at', since.toISOString())
    .limit(1)
    .maybeSingle()

  if (!existingAlert) {
    await adminSupabase.from('user_alerts').insert({
      user_id: session.user_id,
      alert_type: 'session_disconnected',
      title: 'Session déconnectée',
      message: `La session "${session.instance_name}" est déconnectée. Reconnectez-vous via le QR code.`,
      metadata: { session_id: session.id, instance_name: session.instance_name, detected_by: 'send_failure', error },
    })
  }

  console.warn(`[Send] Session ${session.instance_name} detected as disconnected — status updated`)
  return true
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

function getMediaType(mimeType: string): 'image' | 'audio' | 'video' | 'document' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

/** POST /api/conversations/[id]/send — Envoyer un message (texte ou média) */
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

  // Vérifier l'accès (propriétaire uniquement)
  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
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

  const contentType = req.headers.get('content-type') || ''

  // === MEDIA (FormData) ===
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const caption = (formData.get('caption') as string)?.trim() || undefined

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 50 MB)' }, { status: 400 })
    }

    const mimeType = file.type || 'application/octet-stream'
    const mediatype = getMediaType(mimeType)

    // WhatsApp n'accepte l'audio qu'en aac / mp4 / mpeg / amr / ogg(opus).
    // Un audio/webm (Chrome) est refusé par Meta : sans ce garde, l'upload
    // échouait avec une erreur Graph obscure côté serveur.
    if (mediatype === 'audio' && !/^audio\/(aac|mp4|mpeg|amr|ogg)\b/.test(mimeType)) {
      return NextResponse.json(
        { error: `Format audio non supporté par WhatsApp (${mimeType}). Formats acceptés : AAC, MP4, MPEG, AMR, OGG/Opus.` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Envoyer via WhatsApp
    const sendResult = await sendMediaMessage(session, contact.phone_number, {
      mediatype,
      buffer,
      mimetype: mimeType,
      caption,
      fileName: file.name,
    })

    if (!sendResult.ok) {
      const wasDisconnected = await handleDisconnectedSession(sendResult.error, session)
      return NextResponse.json(
        { error: sendResult.error, disconnected: wasDisconnected },
        { status: wasDisconnected ? 409 : 502 }
      )
    }

    // Générer un ID temporaire pour le stockage
    const messageId = crypto.randomUUID()

    // Stocker dans Supabase Storage
    const storageResult = await uploadMedia({
      sessionId: session.id,
      messageId,
      buffer,
      mimeType,
    })

    const mediaUrl = storageResult.ok ? storageResult.storagePath : null
    const encryptedCaption = caption ? encryptMessage(caption) : null

    // Sauvegarder en BDD
    const { data: message, error: dbError } = await supabase
      .from('messages')
      .insert({
        id: messageId,
        conversation_id: id,
        session_id: session.id,
        direction: 'outbound',
        content: encryptedCaption,
        message_type: mediatype,
        media_url: mediaUrl,
        media_mime_type: mimeType,
        sent_by: 'user',
        status: 'sent',
      })
      .select()
      .single()

    if (dbError) {
      console.warn('[Send] Média envoyé mais erreur DB:', dbError.message)
      return NextResponse.json({
        data: { sent: true, id: messageId },
        warning: 'Média envoyé mais non sauvegardé en base',
      })
    }

    // Mettre à jour la conversation
    const preview = caption
      ? caption.slice(0, 100)
      : mediatype === 'image' ? '📷 Image'
      : mediatype === 'audio' ? '🎤 Audio'
      : mediatype === 'video' ? '🎥 Vidéo'
      : `📎 ${file.name}`

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq('id', id)

    return NextResponse.json({
      data: {
        ...message,
        content: caption || null,
      }
    })
  }

  // === TEXTE (JSON) ===
  const body = await req.json()
  const content = body.content as string
  const templateId = body.template_id as string | undefined

  // === TEMPLATE (recontact hors fenêtre 24h) ===
  // Si un template_id est fourni, on envoie un modèle approuvé : c'est le SEUL
  // moyen autorisé par Meta de recontacter un client hors de la fenêtre 24h.
  //
  // On DÉLÈGUE à sendTemplateToContact (le même moteur que les automatisations) :
  // il construit correctement TOUS les composants Meta — body + variables,
  // carrousel, offre limitée (LTO), boutons COPY_CODE — et choisit la bonne
  // variante linguistique. L'ancienne version ne montait qu'un body simple, ce
  // qui cassait les carrousels/LTO (d'où le 502). `manual: true` saute les
  // garde-fous opt-in (le marchand assume le recontact).
  if (templateId) {
    try {
      // Map variables nommées éventuellement fournies par l'UI (clé → valeur).
      const variables = (body.variables && typeof body.variables === 'object')
        ? body.variables as Record<string, string>
        : {}

      const { sendTemplateToContact } = await import('@/lib/automations/dispatch')
      const tplRes = await sendTemplateToContact({
        templateId,
        contactId: conversation.contact_id,
        variables,
        manual: true,
      })

      if (!tplRes.ok) {
        // Modèle introuvable / non approuvé → 400 ; sinon échec d'envoi → 502.
        const notFound = tplRes.error === 'template_introuvable' || tplRes.error === 'template_non_approuve'
        return NextResponse.json(
          { error: tplRes.error || 'Échec de l\'envoi du modèle' },
          { status: notFound ? 400 : 502 }
        )
      }

      // sendTemplateToContact a déjà tracé le message en inbox. On le récupère pour
      // l'affichage optimiste côté UI (le dernier sortant de cette conversation).
      const { data: msg } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      let preview = `[Modèle envoyé]`
      if (msg?.content) {
        try { preview = decryptMessage(msg.content) } catch { /* garde le fallback */ }
      }
      return NextResponse.json({ data: msg ? { ...msg, content: preview } : { sent: true } })
    } catch (err) {
      // Ne JAMAIS laisser une exception tomber le worker en silence (→ 502 muet).
      console.error('[Send] Template branch EXCEPTION:', err)
      const message = err instanceof Error ? `${err.message}` : String(err)
      return NextResponse.json({ error: `Erreur envoi modèle: ${message}` }, { status: 500 })
    }
  }

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  }

  if (content.length > 4096) {
    return NextResponse.json({ error: 'Message trop long (max 4096)' }, { status: 400 })
  }

  // Fenêtre 24h : hors fenêtre, le texte libre sera refusé par Meta — il faut un template.
  const windowState = await getConversationWindow(supabase, id)
  if (!windowState.isOpen) {
    return NextResponse.json(
      {
        error: 'Hors de la fenêtre de 24h : ce client n\'a pas écrit depuis plus de 24h. WhatsApp n\'autorise plus le texte libre — utilisez un modèle (template) approuvé pour le recontacter.',
        window_closed: true,
      },
      { status: 409 }
    )
  }

  // Envoyer via WABA
  const sendResult = await sendMessage(session, contact.phone_number, content.trim())

  if (!sendResult.ok) {
    const wasDisconnected = await handleDisconnectedSession(sendResult.error, session)
    return NextResponse.json(
      { error: sendResult.error, disconnected: wasDisconnected },
      { status: wasDisconnected ? 409 : 502 }
    )
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
