import 'server-only'

import { evolution } from '@/lib/evolution/client'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import type { WhatsAppSession } from '@/types/database'

type SendResult = { ok: true; data: unknown } | { ok: false; error: string }

/**
 * Envoyer un message texte via la bonne intégration (Evolution ou WABA)
 * selon le type de session.
 */
export async function sendMessage(
  session: Pick<WhatsAppSession, 'integration_type' | 'instance_name' | 'waba_phone_number_id' | 'waba_access_token'>,
  phoneNumber: string,
  text: string
): Promise<SendResult> {
  if (session.integration_type === 'waba') {
    if (!session.waba_phone_number_id || !session.waba_access_token) {
      return { ok: false, error: 'Credentials WABA manquants sur la session' }
    }
    return wabaClient.sendText(
      session.waba_phone_number_id,
      session.waba_access_token,
      phoneNumber,
      text
    )
  }

  // Par défaut : Evolution API
  return evolution.sendText(session.instance_name, phoneNumber, text)
}

/**
 * Envoyer un média via la bonne intégration (Evolution ou WABA).
 */
export async function sendMediaMessage(
  session: Pick<WhatsAppSession, 'integration_type' | 'instance_name' | 'waba_phone_number_id' | 'waba_access_token'>,
  phoneNumber: string,
  opts: {
    mediatype: 'image' | 'audio' | 'document' | 'video'
    buffer: Buffer
    mimetype: string
    caption?: string
    fileName?: string
  }
): Promise<SendResult> {
  if (session.integration_type === 'waba') {
    if (!session.waba_phone_number_id || !session.waba_access_token) {
      return { ok: false, error: 'Credentials WABA manquants sur la session' }
    }

    // Étape 1 : Upload vers Meta
    const uploadResult = await wabaClient.uploadMedia(
      session.waba_phone_number_id,
      session.waba_access_token,
      opts.buffer,
      opts.mimetype,
      opts.fileName || 'file'
    )
    if (!uploadResult.ok) {
      return { ok: false, error: uploadResult.error }
    }

    const mediaId = uploadResult.data.id

    // Étape 2 : Envoyer le message avec le media_id
    switch (opts.mediatype) {
      case 'image':
        return wabaClient.sendImage(session.waba_phone_number_id, session.waba_access_token, phoneNumber, mediaId, opts.caption)
      case 'audio':
        return wabaClient.sendAudio(session.waba_phone_number_id, session.waba_access_token, phoneNumber, mediaId)
      case 'video':
        return wabaClient.sendVideo(session.waba_phone_number_id, session.waba_access_token, phoneNumber, mediaId, opts.caption)
      case 'document':
        return wabaClient.sendDocument(session.waba_phone_number_id, session.waba_access_token, phoneNumber, mediaId, opts.fileName)
    }
  }

  // Evolution API : convertir buffer en base64
  const base64 = opts.buffer.toString('base64')
  return evolution.sendMedia(session.instance_name, phoneNumber, {
    mediatype: opts.mediatype,
    media: base64,
    mimetype: opts.mimetype,
    caption: opts.caption,
    fileName: opts.fileName,
  })
}

/**
 * Envoyer un indicateur de présence (typing indicator).
 * Pour WABA, il n'y a pas d'équivalent direct, donc on no-op.
 */
export async function sendPresence(
  session: Pick<WhatsAppSession, 'integration_type' | 'instance_name'>,
  phoneNumber: string,
  presence: 'composing' | 'paused',
  delay?: number
): Promise<void> {
  if (session.integration_type === 'waba') {
    // WhatsApp Cloud API n'a pas de typing indicator natif
    return
  }

  await evolution.sendPresence(session.instance_name, phoneNumber, presence, delay)
}
