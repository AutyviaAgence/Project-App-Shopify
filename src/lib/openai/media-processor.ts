import 'server-only'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { transcribeAudio, describeImage } from './client'

export type MediaExtractionResult = {
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction'
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

  // Audio → Whisper transcription
  if (msgType === 'audio') {
    console.log('[MediaProcessor WABA] Transcribing audio...')
    try {
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
    } catch (err) {
      console.error('[MediaProcessor WABA] Audio transcription error:', err)
      return { messageType: 'audio', content: '[Message vocal]', transcription: null, mediaUrl: null, mediaMimeType: mimeType, mediaBuffer: buffer, tokensUsed: 0 }
    }
  }

  // Image → GPT-4o Vision
  if (msgType === 'image') {
    console.log('[MediaProcessor WABA] Describing image...')
    try {
      const base64 = buffer.toString('base64')
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
    } catch (err) {
      console.error('[MediaProcessor WABA] Image description error:', err)
      return { messageType: 'image', content: caption ? `[Image reçue] ${caption}` : '[Image reçue]', transcription: null, mediaUrl: null, mediaMimeType: mimeType, mediaBuffer: buffer, tokensUsed: 0 }
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
