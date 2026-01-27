import 'server-only'
import { evolution } from '@/lib/evolution/client'
import { transcribeAudio, describeImage } from './client'

export type MediaExtractionResult = {
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
  content: string
  mediaUrl: string | null
}

type MessagePayload = Record<string, unknown>

/**
 * Détecte le type de message depuis le payload Evolution API.
 */
export function detectMessageType(message: MessagePayload): {
  type: MediaExtractionResult['messageType']
  hasMedia: boolean
} {
  if (message.audioMessage) return { type: 'audio', hasMedia: true }
  if (message.imageMessage) return { type: 'image', hasMedia: true }
  if (message.videoMessage) return { type: 'video', hasMedia: true }
  if (message.documentMessage) return { type: 'document', hasMedia: true }
  if (message.stickerMessage) return { type: 'sticker', hasMedia: true }
  if (message.locationMessage) return { type: 'location', hasMedia: false }
  if (message.contactMessage || message.contactsArrayMessage) return { type: 'contact', hasMedia: false }
  return { type: 'text', hasMedia: false }
}

/**
 * Récupère le base64 depuis le payload webhook ou via l'API Evolution.
 */
async function getBase64Data(
  message: MessagePayload,
  instanceName: string,
  messageId: string,
  remoteJid: string
): Promise<string | null> {
  // 1. Base64 directement dans le payload webhook (quand base64: true)
  if (typeof message.base64 === 'string' && message.base64.length > 0) {
    return message.base64
  }

  // 2. Fallback : récupérer via Evolution API
  const result = await evolution.getBase64FromMediaMessage(instanceName, messageId, remoteJid)
  if (result.ok && result.data?.base64) {
    return result.data.base64
  }

  console.warn('[MediaProcessor] Could not get base64 data for message:', messageId)
  return null
}

/**
 * Détermine le MIME type depuis le payload.
 */
function getMimeType(message: MessagePayload, type: string): string {
  const mediaMsg = message[`${type}Message`] as MessagePayload | undefined
  if (mediaMsg?.mimetype) return mediaMsg.mimetype as string

  switch (type) {
    case 'audio': return 'audio/ogg; codecs=opus'
    case 'image': return 'image/jpeg'
    case 'video': return 'video/mp4'
    case 'document': return 'application/octet-stream'
    case 'sticker': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

/**
 * Traite un message média et retourne une représentation texte pour le contexte IA.
 */
export async function processMediaMessage(
  message: MessagePayload,
  instanceName: string,
  messageId: string,
  remoteJid: string
): Promise<MediaExtractionResult> {
  const { type, hasMedia } = detectMessageType(message)

  // Messages texte
  if (type === 'text') {
    const textContent = (message.conversation as string)
      || ((message.extendedTextMessage as MessagePayload)?.text as string)
      || ''
    return { messageType: 'text', content: textContent, mediaUrl: null }
  }

  // Location
  if (type === 'location') {
    const loc = message.locationMessage as MessagePayload
    const lat = loc?.degreesLatitude
    const lng = loc?.degreesLongitude
    return {
      messageType: 'location',
      content: `[Location partagée : ${lat}, ${lng}]`,
      mediaUrl: null,
    }
  }

  // Contact
  if (type === 'contact') {
    const contactMsg = message.contactMessage as MessagePayload
    const displayName = contactMsg?.displayName || 'contact inconnu'
    return {
      messageType: 'contact',
      content: `[Contact partagé : ${displayName}]`,
      mediaUrl: null,
    }
  }

  // Sticker
  if (type === 'sticker') {
    return { messageType: 'sticker', content: '[Sticker reçu]', mediaUrl: null }
  }

  // Vidéo (pas de traitement lourd)
  if (type === 'video') {
    const videoMsg = message.videoMessage as MessagePayload
    const caption = (videoMsg?.caption as string) || ''
    return {
      messageType: 'video',
      content: caption ? `[Vidéo reçue avec légende : ${caption}]` : '[Vidéo reçue]',
      mediaUrl: null,
    }
  }

  // --- Médias nécessitant base64 ---
  if (!hasMedia) {
    return { messageType: type, content: `[${type} reçu]`, mediaUrl: null }
  }

  const base64 = await getBase64Data(message, instanceName, messageId, remoteJid)
  const mimeType = getMimeType(message, type)

  // Audio → Whisper transcription
  if (type === 'audio') {
    if (!base64) {
      return {
        messageType: 'audio',
        content: '[Message vocal reçu - transcription impossible]',
        mediaUrl: null,
      }
    }
    console.log('[MediaProcessor] Transcribing audio...')
    const audioBuffer = Buffer.from(base64, 'base64')
    const result = await transcribeAudio(audioBuffer, mimeType)
    return {
      messageType: 'audio',
      content: result.ok
        ? `[Message vocal transcrit] : "${result.text}"`
        : '[Message vocal reçu - transcription échouée]',
      mediaUrl: null,
    }
  }

  // Image → GPT-4o Vision
  if (type === 'image') {
    const imageMsg = message.imageMessage as MessagePayload
    const caption = (imageMsg?.caption as string) || ''

    if (!base64) {
      return {
        messageType: 'image',
        content: caption
          ? `[Image reçue avec légende : ${caption}]`
          : '[Image reçue - description impossible]',
        mediaUrl: null,
      }
    }
    console.log('[MediaProcessor] Describing image...')
    const result = await describeImage(base64, mimeType)
    const description = result.ok ? result.description : 'description non disponible'
    return {
      messageType: 'image',
      content: caption
        ? `[Image reçue - description : ${description}] Légende : ${caption}`
        : `[Image reçue - description : ${description}]`,
      mediaUrl: null,
    }
  }

  // Document
  if (type === 'document') {
    const docMsg = message.documentMessage as MessagePayload
    const fileName = (docMsg?.fileName as string) || 'document'
    const docMime = (docMsg?.mimetype as string) || 'inconnu'
    return {
      messageType: 'document',
      content: `[Document reçu : ${fileName} (${docMime})]`,
      mediaUrl: null,
    }
  }

  // Fallback
  return { messageType: type, content: `[${type} reçu]`, mediaUrl: null }
}
