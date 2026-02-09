import 'server-only'
import { evolution } from '@/lib/evolution/client'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { transcribeAudio, describeImage } from './client'

export type MediaExtractionResult = {
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
  content: string
  transcription: string | null
  mediaUrl: string | null
  mediaMimeType: string | null
  mediaBuffer: Buffer | null
  tokensUsed: number
}

type MessagePayload = Record<string, unknown>

const NO_MEDIA: Pick<MediaExtractionResult, 'mediaUrl' | 'mediaMimeType' | 'mediaBuffer'> = {
  mediaUrl: null,
  mediaMimeType: null,
  mediaBuffer: null,
}

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
  if (typeof message.base64 === 'string' && message.base64.length > 0) {
    return message.base64
  }

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
 * Traite un message média Evolution API.
 * Retourne le buffer brut + transcription séparée du content.
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
    return { messageType: 'text', content: textContent, transcription: null, ...NO_MEDIA, tokensUsed: 0 }
  }

  // Location
  if (type === 'location') {
    const loc = message.locationMessage as MessagePayload
    const lat = loc?.degreesLatitude
    const lng = loc?.degreesLongitude
    return {
      messageType: 'location',
      content: `[Location partagée : ${lat}, ${lng}]`,
      transcription: null,
      ...NO_MEDIA,
      tokensUsed: 0,
    }
  }

  // Contact
  if (type === 'contact') {
    const contactMsg = message.contactMessage as MessagePayload
    const displayName = contactMsg?.displayName || 'contact inconnu'
    return {
      messageType: 'contact',
      content: `[Contact partagé : ${displayName}]`,
      transcription: null,
      ...NO_MEDIA,
      tokensUsed: 0,
    }
  }

  // Sticker
  if (type === 'sticker') {
    return { messageType: 'sticker', content: '[Sticker reçu]', transcription: null, ...NO_MEDIA, tokensUsed: 0 }
  }

  // Vidéo
  if (type === 'video') {
    const videoMsg = message.videoMessage as MessagePayload
    const caption = (videoMsg?.caption as string) || ''
    const mimeType = getMimeType(message, type)

    // Essayer de récupérer le buffer pour le stockage
    const base64 = await getBase64Data(message, instanceName, messageId, remoteJid)
    const videoBuffer = base64 ? Buffer.from(base64, 'base64') : null

    return {
      messageType: 'video',
      content: caption ? `[Vidéo reçue avec légende : ${caption}]` : '[Vidéo reçue]',
      transcription: null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: videoBuffer,
      tokensUsed: 0,
    }
  }

  // --- Médias nécessitant base64 ---
  if (!hasMedia) {
    return { messageType: type, content: `[${type} reçu]`, transcription: null, ...NO_MEDIA, tokensUsed: 0 }
  }

  const base64 = await getBase64Data(message, instanceName, messageId, remoteJid)
  const mimeType = getMimeType(message, type)

  // Audio → Whisper transcription
  if (type === 'audio') {
    if (!base64) {
      return {
        messageType: 'audio',
        content: '[Message vocal]',
        transcription: null,
        mediaUrl: null,
        mediaMimeType: mimeType,
        mediaBuffer: null,
        tokensUsed: 0,
      }
    }
    console.log('[MediaProcessor] Transcribing audio...')
    const audioBuffer = Buffer.from(base64, 'base64')
    const result = await transcribeAudio(audioBuffer, mimeType)
    return {
      messageType: 'audio',
      content: '[Message vocal]',
      transcription: result.ok ? result.text : null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: audioBuffer,
      tokensUsed: result.ok ? result.tokensUsed : 0,
    }
  }

  // Image → GPT-4o Vision
  if (type === 'image') {
    const imageMsg = message.imageMessage as MessagePayload
    const caption = (imageMsg?.caption as string) || ''
    const imageBuffer = base64 ? Buffer.from(base64, 'base64') : null

    if (!base64) {
      return {
        messageType: 'image',
        content: caption ? `[Image reçue] ${caption}` : '[Image reçue]',
        transcription: null,
        mediaUrl: null,
        mediaMimeType: mimeType,
        mediaBuffer: null,
        tokensUsed: 0,
      }
    }
    console.log('[MediaProcessor] Describing image...')
    const result = await describeImage(base64, mimeType)
    return {
      messageType: 'image',
      content: caption ? `[Image reçue] ${caption}` : '[Image reçue]',
      transcription: result.ok ? result.description : null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: imageBuffer,
      tokensUsed: result.ok ? result.tokensUsed : 0,
    }
  }

  // Document
  if (type === 'document') {
    const docMsg = message.documentMessage as MessagePayload
    const fileName = (docMsg?.fileName as string) || 'document'
    const docBuffer = base64 ? Buffer.from(base64, 'base64') : null

    return {
      messageType: 'document',
      content: `[Document : ${fileName}]`,
      transcription: null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: docBuffer,
      tokensUsed: 0,
    }
  }

  // Fallback
  return { messageType: type, content: `[${type} reçu]`, transcription: null, ...NO_MEDIA, tokensUsed: 0 }
}

/**
 * Traite un message média WABA (WhatsApp Cloud API) via Meta Graph API.
 * Retourne le buffer brut + transcription séparée du content.
 */
export async function processWabaMediaMessage(
  msgType: 'image' | 'audio' | 'video' | 'document' | 'sticker',
  mediaId: string,
  accessToken: string,
  caption?: string,
  filename?: string
): Promise<MediaExtractionResult> {
  // Sticker
  if (msgType === 'sticker') {
    return { messageType: 'sticker', content: '[Sticker reçu]', transcription: null, ...NO_MEDIA, tokensUsed: 0 }
  }

  // Vidéo
  if (msgType === 'video') {
    // Télécharger pour stockage même sans traitement lourd
    const downloadResult = await wabaClient.downloadMedia(mediaId, accessToken)
    return {
      messageType: 'video',
      content: caption ? `[Vidéo reçue avec légende : ${caption}]` : '[Vidéo reçue]',
      transcription: null,
      mediaUrl: null,
      mediaMimeType: downloadResult.ok ? downloadResult.mimeType : 'video/mp4',
      mediaBuffer: downloadResult.ok ? downloadResult.buffer : null,
      tokensUsed: 0,
    }
  }

  // Télécharger le média via Meta Graph API
  const downloadResult = await wabaClient.downloadMedia(mediaId, accessToken)

  if (!downloadResult.ok) {
    console.warn('[MediaProcessor WABA] Download failed:', downloadResult.error)
    if (msgType === 'audio') {
      return { messageType: 'audio', content: '[Message vocal]', transcription: null, ...NO_MEDIA, tokensUsed: 0 }
    }
    if (msgType === 'image') {
      return {
        messageType: 'image',
        content: caption ? `[Image reçue] ${caption}` : '[Image reçue]',
        transcription: null,
        ...NO_MEDIA,
        tokensUsed: 0,
      }
    }
    if (msgType === 'document') {
      return {
        messageType: 'document',
        content: `[Document : ${filename || 'document'}]`,
        transcription: null,
        ...NO_MEDIA,
        tokensUsed: 0,
      }
    }
    return { messageType: msgType, content: `[${msgType} reçu]`, transcription: null, ...NO_MEDIA, tokensUsed: 0 }
  }

  const { buffer, mimeType } = downloadResult
  const base64 = buffer.toString('base64')

  // Audio → Whisper transcription
  if (msgType === 'audio') {
    console.log('[MediaProcessor WABA] Transcribing audio...')
    const result = await transcribeAudio(buffer, mimeType)
    return {
      messageType: 'audio',
      content: '[Message vocal]',
      transcription: result.ok ? result.text : null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: buffer,
      tokensUsed: result.ok ? result.tokensUsed : 0,
    }
  }

  // Image → GPT-4o Vision
  if (msgType === 'image') {
    console.log('[MediaProcessor WABA] Describing image...')
    const result = await describeImage(base64, mimeType)
    return {
      messageType: 'image',
      content: caption ? `[Image reçue] ${caption}` : '[Image reçue]',
      transcription: result.ok ? result.description : null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: buffer,
      tokensUsed: result.ok ? result.tokensUsed : 0,
    }
  }

  // Document
  if (msgType === 'document') {
    return {
      messageType: 'document',
      content: `[Document : ${filename || 'document'}]`,
      transcription: null,
      mediaUrl: null,
      mediaMimeType: mimeType,
      mediaBuffer: buffer,
      tokensUsed: 0,
    }
  }

  return { messageType: msgType, content: `[${msgType} reçu]`, transcription: null, ...NO_MEDIA, tokensUsed: 0 }
}
