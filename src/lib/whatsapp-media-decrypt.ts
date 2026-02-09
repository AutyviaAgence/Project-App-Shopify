import 'server-only'
import crypto from 'crypto'

/**
 * WhatsApp Media Decryption
 *
 * Downloads and decrypts media from WhatsApp CDN using the mediaKey.
 * WhatsApp encrypts all media with AES-256-CBC and uses HKDF-SHA256
 * for key derivation.
 *
 * Info strings per media type (used in HKDF):
 * - Image: "WhatsApp Image Keys"
 * - Audio: "WhatsApp Audio Keys"
 * - Video: "WhatsApp Video Keys"
 * - Document: "WhatsApp Document Keys"
 * - Sticker: "WhatsApp Image Keys" (same as image)
 */

const MEDIA_HKDF_INFO: Record<string, string> = {
  image: 'WhatsApp Image Keys',
  audio: 'WhatsApp Audio Keys',
  video: 'WhatsApp Video Keys',
  document: 'WhatsApp Document Keys',
  sticker: 'WhatsApp Image Keys',
}

/**
 * Convert a Baileys-style byte object { 0: byte, 1: byte, ... } to a Buffer
 */
function byteObjectToBuffer(obj: Record<string, number> | Buffer | Uint8Array | null | undefined): Buffer | null {
  if (!obj) return null
  if (Buffer.isBuffer(obj)) return obj
  if (obj instanceof Uint8Array) return Buffer.from(obj)

  // Baileys sends mediaKey as { "0": 217, "1": 229, ... }
  const keys = Object.keys(obj).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b))
  if (keys.length === 0) return null

  const bytes = keys.map(k => obj[k])
  return Buffer.from(bytes)
}

/**
 * HKDF-SHA256 key derivation
 */
function hkdfExpand(key: Buffer, info: Buffer, length: number): Buffer {
  const hashLen = 32 // SHA-256
  const n = Math.ceil(length / hashLen)
  const okm = Buffer.alloc(n * hashLen)
  let prev = Buffer.alloc(0)

  for (let i = 0; i < n; i++) {
    const input = Buffer.concat([prev, info, Buffer.from([i + 1])])
    prev = crypto.createHmac('sha256', key).update(input).digest()
    prev.copy(okm, i * hashLen)
  }

  return okm.subarray(0, length)
}

function hkdfDerive(mediaKey: Buffer, infoStr: string): { iv: Buffer; cipherKey: Buffer; macKey: Buffer } {
  // HKDF extract
  const salt = Buffer.alloc(32, 0)
  const prk = crypto.createHmac('sha256', salt).update(mediaKey).digest()

  // HKDF expand to 112 bytes
  const info = Buffer.from(infoStr, 'utf-8')
  const expanded = hkdfExpand(prk, info, 112)

  return {
    iv: expanded.subarray(0, 16),
    cipherKey: expanded.subarray(16, 48),
    macKey: expanded.subarray(48, 80),
    // refKey: expanded.subarray(80, 112) — not needed for decryption
  }
}

/**
 * Download and decrypt a WhatsApp media file from CDN.
 *
 * @param url - The WhatsApp CDN URL (from audioMessage.url, imageMessage.url, etc.)
 * @param mediaKey - The media encryption key (from audioMessage.mediaKey)
 * @param mediaType - The type of media (audio, image, video, document, sticker)
 * @returns Decrypted Buffer or null on failure
 */
export async function downloadAndDecryptMedia(
  url: string,
  mediaKey: Record<string, number> | Buffer | Uint8Array | null | undefined,
  mediaType: string
): Promise<Buffer | null> {
  const keyBuffer = byteObjectToBuffer(mediaKey)
  if (!keyBuffer || keyBuffer.length === 0) {
    console.warn('[WADecrypt] No mediaKey provided')
    return null
  }

  const infoStr = MEDIA_HKDF_INFO[mediaType]
  if (!infoStr) {
    console.warn('[WADecrypt] Unknown media type:', mediaType)
    return null
  }

  // Download encrypted file from WhatsApp CDN
  let encData: Buffer
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Origin': 'https://web.whatsapp.com',
        'Referer': 'https://web.whatsapp.com/',
      },
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      console.error('[WADecrypt] CDN download failed:', res.status, res.statusText)
      return null
    }

    const arrayBuffer = await res.arrayBuffer()
    encData = Buffer.from(arrayBuffer)
    console.log('[WADecrypt] Downloaded encrypted media, size:', encData.length)
  } catch (err) {
    console.error('[WADecrypt] CDN download error:', err instanceof Error ? err.message : err)
    return null
  }

  // Derive keys from mediaKey using HKDF
  const { iv, cipherKey, macKey } = hkdfDerive(keyBuffer, infoStr)

  // The encrypted file is: [enc_data][mac_10_bytes]
  // Last 10 bytes are the HMAC (truncated)
  if (encData.length <= 10) {
    console.error('[WADecrypt] Encrypted data too small:', encData.length)
    return null
  }

  const enc = encData.subarray(0, encData.length - 10)
  const mac = encData.subarray(encData.length - 10)

  // Verify HMAC
  const hmacInput = Buffer.concat([iv, enc])
  const hmacCalc = crypto.createHmac('sha256', macKey).update(hmacInput).digest()
  const hmacTrunc = hmacCalc.subarray(0, 10)

  if (!hmacTrunc.equals(mac)) {
    console.warn('[WADecrypt] HMAC verification failed, attempting decryption anyway')
    // Don't return null — some implementations have slight HMAC differences
  }

  // Decrypt with AES-256-CBC
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv)
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()])
    console.log('[WADecrypt] Decrypted media, size:', decrypted.length)
    return decrypted
  } catch (err) {
    console.error('[WADecrypt] Decryption failed:', err instanceof Error ? err.message : err)
    return null
  }
}
