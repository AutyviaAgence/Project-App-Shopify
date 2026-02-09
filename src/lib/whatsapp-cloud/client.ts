import 'server-only'

/**
 * WhatsApp Cloud API Client — server-only
 * Appels directs à l'API Meta Graph pour envoyer des messages via WhatsApp Business
 */

const GRAPH_API_VERSION = 'v22.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`
const TIMEOUT = 15000

async function request<T = unknown>(
  url: string,
  accessToken: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { timeout = TIMEOUT, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text}` }
    }

    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    clearTimeout(timeoutId)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: message }
  }
}

export const wabaClient = {
  /** Envoyer un message texte */
  sendText(phoneNumberId: string, accessToken: string, to: string, text: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    })
  },

  /** Envoyer un template (ex: hello_world) */
  sendTemplate(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string = 'en_US'
  ) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      }),
    })
  },

  /** Marquer un message comme lu */
  markAsRead(phoneNumberId: string, accessToken: string, messageId: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
  },

  /** Récupérer le profil business du numéro */
  getPhoneNumber(phoneNumberId: string, accessToken: string) {
    return request<{
      id: string
      display_phone_number: string
      verified_name: string
      quality_rating: string
    }>(`${GRAPH_API_BASE}/${phoneNumberId}`, accessToken, {
      method: 'GET',
    })
  },

  /** Télécharger un média via son ID (2 étapes : get URL puis download binary) */
  async downloadMedia(
    mediaId: string,
    accessToken: string
  ): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; error: string }> {
    // Étape 1 : Récupérer l'URL du média
    const metaResult = await request<{ url: string; mime_type: string; file_size: number }>(
      `${GRAPH_API_BASE}/${mediaId}`,
      accessToken,
      { method: 'GET' }
    )

    if (!metaResult.ok) {
      return { ok: false, error: `Failed to get media URL: ${metaResult.error}` }
    }

    const { url, mime_type } = metaResult.data

    // Étape 2 : Télécharger le fichier binaire
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s pour les gros fichiers

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        return { ok: false, error: `Failed to download media: HTTP ${res.status}` }
      }

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      return { ok: true, buffer, mimeType: mime_type }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: `Media download failed: ${message}` }
    }
  },
}
