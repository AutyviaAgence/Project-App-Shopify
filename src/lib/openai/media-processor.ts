import 'server-only'
import { evolution } from '@/lib/evolution/client'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { transcribeAudio, describeImage } from './client'
import { downloadAndDecryptMedia } from '@/lib/whatsapp-media-decrypt'

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
 * Strip data URI prefix (e.g. "data:audio/ogg;base64,AAAA..." → "AAAA...")
 */
function stripDataUri(input: string): string {
  const commaIndex = input.indexOf(',')
  if (commaIndex !== -1 && input.startsWith('data:')) {
    return input.slice(commaIndex + 1)
  }
  return input
}

/** Small delay helper */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract media info (url, directPath, mediaKey) from a message payload.
 * Works with both webhook message payload and stored message from findMessages.
 */
function extractMediaInfo(message: MessagePayload): {
  url?: string
  directPath?: string
  mediaKey?: Record<string, number>
  mediaType?: string
} | null {
  const mediaTypes = ['audio', 'image', 'video', 'document', 'sticker']
  for (const type of mediaTypes) {
    const mediaMsg = message[`${type}Message`] as MessagePayload | undefined
    if (mediaMsg) {
      return {
        url: mediaMsg.url as string | undefined,
        directPath: mediaMsg.directPath as string | undefined,
        mediaKey: mediaMsg.mediaKey as Record<string, number> | undefined,
        mediaType: type,
      }
    }
  }
  return null
}

/**
 * Try to download media directly from WhatsApp CDN and decrypt it.
 * This bypasses Evolution API entirely and uses the mediaKey from the webhook.
 */
async function tryCdnDecrypt(
  message: MessagePayload,
  label: string
): Promise<string | null> {
  const info = extractMediaInfo(message)
  if (!info?.mediaKey || (!info.url && !info.directPath)) {
    return null
  }

  try {
    const decrypted = await downloadAndDecryptMedia(
      { url: info.url, directPath: info.directPath, mediaKey: info.mediaKey },
      info.mediaType || 'audio'
    )
    if (decrypted && decrypted.length > 0) {
      const b64 = decrypted.toString('base64')
      console.log(`[MediaProcessor] ${label} — CDN decrypt success, length:`, b64.length)
      return b64
    }
  } catch (err) {
    console.error(`[MediaProcessor] ${label} CDN decrypt error:`, err)
  }
  return null
}

/**
 * Tente de récupérer le base64 via getBase64FromMediaMessage avec le JID donné.
 * Retourne le base64 brut ou null.
 */
async function tryGetBase64(
  instanceName: string,
  messageId: string,
  remoteJid: string,
  label: string
): Promise<string | null> {
  try {
    const result = await evolution.getBase64FromMediaMessage(instanceName, messageId, remoteJid)
    if (result.ok && result.data?.base64 && result.data.base64.length > 0) {
      const raw = stripDataUri(result.data.base64)
      console.log(`[MediaProcessor] ${label} — got base64, length:`, raw.length)
      return raw
    }
  } catch (err) {
    console.error(`[MediaProcessor] ${label} error:`, err)
  }
  return null
}

/**
 * Tente de récupérer le base64 en passant le message complet (avec mediaKey).
 * Ceci permet à Evolution API de re-télécharger le média avec les bonnes clés.
 */
async function tryGetBase64WithFullMessage(
  instanceName: string,
  fullMessage: { key: Record<string, unknown>; message: Record<string, unknown> },
  label: string
): Promise<string | null> {
  try {
    const result = await evolution.getBase64FromFullMessage(instanceName, fullMessage)
    if (result.ok && result.data?.base64 && result.data.base64.length > 0) {
      const raw = stripDataUri(result.data.base64)
      console.log(`[MediaProcessor] ${label} — got base64 with full message, length:`, raw.length)
      return raw
    }
  } catch (err) {
    console.error(`[MediaProcessor] ${label} error:`, err)
  }
  return null
}

/**
 * Récupère le base64 depuis le payload webhook ou via l'API Evolution.
 * Retourne du base64 pur (sans préfixe data URI).
 *
 * Stratégie multi-étapes avec retries pour contourner le bug Baileys
 * où downloadMediaMessage('buffer') retourne un buffer vide pour les
 * messages de contacts externes.
 */
export async function getBase64Data(
  message: MessagePayload,
  instanceName: string,
  messageId: string,
  remoteJid: string
): Promise<string | null> {
  // 1. Check webhook payload (if WEBHOOK_BASE64 is enabled or injected)
  if (typeof message.base64 === 'string' && message.base64.length > 0) {
    const raw = stripDataUri(message.base64)
    console.log('[MediaProcessor] Using base64 from webhook payload, length:', raw.length)
    return raw
  }

  // 2. Try immediately with webhook remoteJid via Evolution API
  const immediate = await tryGetBase64(instanceName, messageId, remoteJid, 'Attempt 1 (webhook JID)')
  if (immediate) return immediate

  // 3. Try direct CDN download + decrypt using mediaKey from webhook payload
  // This bypasses Evolution API's buggy downloadMediaMessage('buffer')
  // Must be done ASAP before the CDN URL expires (minutes)
  const cdnResult = await tryCdnDecrypt(message, 'Attempt 2 (CDN decrypt)')
  if (cdnResult) return cdnResult

  // 4. Resolve the LID and get full stored message for retries
  let lidJid: string | null = null
  let storedMessage: { key: Record<string, unknown>; message: Record<string, unknown> } | null = null
  try {
    const findResult = await evolution.findMessageById(instanceName, messageId)
    if (findResult.ok && findResult.data?.messages?.records?.length > 0) {
      const record = findResult.data.messages.records[0]
      lidJid = record.key.remoteJid
      storedMessage = { key: record.key as Record<string, unknown>, message: record.message }
      if (lidJid && lidJid !== remoteJid) {
        console.log('[MediaProcessor] Resolved LID:', lidJid, '(webhook had:', remoteJid + ')')
      }
    }
  } catch (err) {
    console.error('[MediaProcessor] findMessageById error:', err)
  }

  // 5. Try CDN decrypt with stored message (may have more complete media info)
  if (storedMessage?.message) {
    const storedCdn = await tryCdnDecrypt(storedMessage.message as MessagePayload, 'Attempt 3 (CDN stored msg)')
    if (storedCdn) return storedCdn
  }

  // 6. Try with LID if different from webhook JID
  if (lidJid && lidJid !== remoteJid) {
    const lidResult = await tryGetBase64(instanceName, messageId, lidJid, 'Attempt 4 (LID)')
    if (lidResult) return lidResult
  }

  // 7. Try with the FULL stored message via Evolution API
  if (storedMessage) {
    const fullResult = await tryGetBase64WithFullMessage(instanceName, storedMessage, 'Attempt 5 (full msg API)')
    if (fullResult) return fullResult
  }

  // 8. RETRY WITH DELAYS — last resort
  // Wait and retry to give Baileys more time
  const retryDelays = [3000, 6000]

  for (let i = 0; i < retryDelays.length; i++) {
    console.log(`[MediaProcessor] Retry ${i + 1}/${retryDelays.length} — waiting ${retryDelays[i]}ms...`)
    await delay(retryDelays[i])

    try {
      const findResult = await evolution.findMessageById(instanceName, messageId)
      if (findResult.ok && findResult.data?.messages?.records?.length > 0) {
        const record = findResult.data.messages.records[0]
        const freshMessage = { key: record.key as Record<string, unknown>, message: record.message }

        // Try CDN decrypt with fresh stored message
        const cdnRetry = await tryCdnDecrypt(record.message as MessagePayload, `Retry ${i + 1} (CDN)`)
        if (cdnRetry) return cdnRetry

        // Try full message via Evolution API
        const fullRetry = await tryGetBase64WithFullMessage(
          instanceName, freshMessage, `Retry ${i + 1} (full msg API)`
        )
        if (fullRetry) return fullRetry
      }
    } catch (err) {
      console.error(`[MediaProcessor] Retry ${i + 1} error:`, err)
    }
  }

  console.warn('[MediaProcessor] All methods failed after retries for:', messageId)
  return null
}

/**
 * Détermine le MIME type depuis le payload.
 */
export function getMimeType(message: MessagePayload, type: string): string {
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
 * @param preloadedBase64 - base64 déjà téléchargé (évite un double appel API)
 */
export async function processMediaMessage(
  message: MessagePayload,
  instanceName: string,
  messageId: string,
  remoteJid: string,
  preloadedBase64?: string | null
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

    const base64 = preloadedBase64 ?? await getBase64Data(message, instanceName, messageId, remoteJid)
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

  // Utiliser le base64 pré-chargé ou le télécharger
  const base64 = preloadedBase64 ?? await getBase64Data(message, instanceName, messageId, remoteJid)
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
    try {
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
    } catch (err) {
      console.error('[MediaProcessor] Audio transcription error:', err)
      return { messageType: 'audio', content: '[Message vocal]', transcription: null, mediaUrl: null, mediaMimeType: mimeType, mediaBuffer: null, tokensUsed: 0 }
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
    try {
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
    } catch (err) {
      console.error('[MediaProcessor] Image description error:', err)
      return { messageType: 'image', content: caption ? `[Image reçue] ${caption}` : '[Image reçue]', transcription: null, mediaUrl: null, mediaMimeType: mimeType, mediaBuffer: imageBuffer, tokensUsed: 0 }
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
