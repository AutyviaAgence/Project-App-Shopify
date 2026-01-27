import 'server-only'

/**
 * Evolution API Client — server-only
 */

const TIMEOUT = 15000

function getConfig() {
  const url = process.env.EVOLUTION_API_URL
  const key = process.env.EVOLUTION_API_KEY
  if (!url) throw new Error('[Evolution] EVOLUTION_API_URL is required')
  if (!key) throw new Error('[Evolution] EVOLUTION_API_KEY is required')
  return { url, key }
}

async function request<T = unknown>(
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { url, key } = getConfig()
  const { timeout = TIMEOUT, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${url}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        apikey: key,
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

export const evolution = {
  /** Créer une instance + récupérer le QR code */
  createInstance(instanceName: string) {
    return request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    })
  },

  /** Récupérer le QR code d'une instance */
  getQRCode(instanceName: string) {
    return request(`/instance/connect/${instanceName}`, { method: 'GET' })
  },

  /** Vérifier l'état de connexion */
  getConnectionState(instanceName: string) {
    return request<{ instance: { state: string } }>(
      `/instance/connectionState/${instanceName}`,
      { method: 'GET' }
    )
  },

  /** Déconnecter (logout) */
  disconnect(instanceName: string) {
    return request(`/instance/logout/${instanceName}`, { method: 'DELETE' })
  },

  /** Supprimer une instance */
  deleteInstance(instanceName: string) {
    return request(`/instance/delete/${instanceName}`, { method: 'DELETE' })
  },

  /** Envoyer un message texte */
  sendText(instanceName: string, number: string, text: string) {
    return request(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    })
  },

  /** Configurer le webhook */
  setWebhook(instanceName: string, webhookUrl: string) {
    return request(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
      }),
    })
  },
}
