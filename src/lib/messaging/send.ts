import 'server-only'

import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import type { WhatsAppSession } from '@/types/database'

/** Decrypt waba_access_token if it's encrypted */
export function decryptWabaToken(session: Pick<WhatsAppSession, 'waba_access_token'>): string | null {
  if (!session.waba_access_token) return null
  return decryptMessage(session.waba_access_token)
}

type SendResult = { ok: true; data: unknown } | { ok: false; error: string }

/**
 * Envoyer un message texte via WhatsApp Business API (WABA).
 */
export async function sendMessage(
  session: Pick<WhatsAppSession, 'waba_phone_number_id' | 'waba_access_token'>,
  phoneNumber: string,
  text: string
): Promise<SendResult> {
  const token = decryptWabaToken(session)
  if (!session.waba_phone_number_id || !token) {
    return { ok: false, error: 'Credentials WABA manquants sur la session' }
  }
  return wabaClient.sendText(
    session.waba_phone_number_id,
    token,
    phoneNumber,
    text
  )
}

/**
 * Envoyer un média via WhatsApp Business API (WABA).
 */
export async function sendMediaMessage(
  session: Pick<WhatsAppSession, 'waba_phone_number_id' | 'waba_access_token'>,
  phoneNumber: string,
  opts: {
    mediatype: 'image' | 'audio' | 'document' | 'video'
    buffer: Buffer
    mimetype: string
    caption?: string
    fileName?: string
  }
): Promise<SendResult> {
  const token = decryptWabaToken(session)
  if (!session.waba_phone_number_id || !token) {
    return { ok: false, error: 'Credentials WABA manquants sur la session' }
  }

  // Étape 1 : Upload vers Meta
  const uploadResult = await wabaClient.uploadMedia(
    session.waba_phone_number_id,
    token,
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
      return wabaClient.sendImage(session.waba_phone_number_id, token, phoneNumber, mediaId, opts.caption)
    case 'audio':
      return wabaClient.sendAudio(session.waba_phone_number_id, token, phoneNumber, mediaId)
    case 'video':
      return wabaClient.sendVideo(session.waba_phone_number_id, token, phoneNumber, mediaId, opts.caption)
    case 'document':
      return wabaClient.sendDocument(session.waba_phone_number_id, token, phoneNumber, mediaId, opts.fileName)
  }
}

/**
 * Envoyer un message interactif (boutons de réponse rapide) via WABA.
 * Message LIBRE — valable dans la fenêtre de 24h, aucun template requis.
 */
export async function sendInteractiveMessage(
  session: Pick<WhatsAppSession, 'waba_phone_number_id' | 'waba_access_token'>,
  phoneNumber: string,
  opts: {
    bodyText: string
    buttons: { id: string; title: string }[]
  }
): Promise<SendResult> {
  const token = decryptWabaToken(session)
  if (!session.waba_phone_number_id || !token) {
    return { ok: false, error: 'Credentials WABA manquants sur la session' }
  }
  if (!opts.bodyText.trim()) {
    return { ok: false, error: 'Corps du message interactif vide' }
  }
  if (!opts.buttons.length) {
    return { ok: false, error: 'Aucun bouton fourni' }
  }
  return wabaClient.sendInteractiveButtons(
    session.waba_phone_number_id,
    token,
    phoneNumber,
    opts.bodyText,
    opts.buttons
  )
}

/**
 * Indicateur de présence (typing) — WhatsApp Cloud API n'a pas d'équivalent natif.
 * Conservé comme no-op pour compatibilité des appels existants.
 */
export async function sendPresence(
  _session: unknown,
  _phoneNumber: string,
  _presence: 'composing' | 'paused',
  _delay?: number
): Promise<void> {
  return
}
