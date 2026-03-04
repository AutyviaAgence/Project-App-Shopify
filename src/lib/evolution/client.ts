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
  /** Créer une instance + récupérer le QR code ou pairing code */
  createInstance(instanceName: string, phoneNumber?: string) {
    const body: Record<string, unknown> = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }
    if (phoneNumber) {
      body.number = phoneNumber
    }
    return request('/instance/create', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Récupérer le QR code ou pairing code d'une instance */
  getConnectionCode(instanceName: string, phoneNumber?: string) {
    const query = phoneNumber ? `?number=${phoneNumber}` : ''
    return request(`/instance/connect/${instanceName}${query}`, { method: 'GET' })
  },

  /** Récupérer le QR code d'une instance (alias) */
  getQRCode(instanceName: string) {
    return this.getConnectionCode(instanceName)
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

  /** Envoyer un média (image, audio, document, vidéo) */
  sendMedia(instanceName: string, number: string, opts: {
    mediatype: 'image' | 'audio' | 'document' | 'video'
    media: string  // base64
    mimetype: string
    caption?: string
    fileName?: string
  }) {
    return request(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        mediatype: opts.mediatype,
        media: opts.media,
        mimetype: opts.mimetype,
        caption: opts.caption,
        fileName: opts.fileName,
      }),
      timeout: 60000, // 60s pour les gros fichiers
    })
  },

  /** Envoyer un audio WhatsApp en tant que vocal (PTT) */
  sendWhatsAppAudio(instanceName: string, number: string, audio: string) {
    return request(`/message/sendWhatsAppAudio/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, audio }),
      timeout: 60000,
    })
  },

  /** Récupérer les infos d'une instance (owner, profileName, etc.) */
  fetchInstance(instanceName: string) {
    return request(`/instance/fetchInstances?instanceName=${instanceName}`, {
      method: 'GET',
    })
  },

  /** Récupérer le média en base64 depuis un message */
  getBase64FromMediaMessage(
    instanceName: string,
    messageId: string,
    remoteJid: string,
  ) {
    return request<{ base64: string }>(`/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        message: { key: { remoteJid, id: messageId } },
      }),
      timeout: 30000,
    })
  },

  /** Envoyer une présence (composing/paused) pour simuler la saisie */
  sendPresence(instanceName: string, number: string, presence: 'composing' | 'paused', delay?: number) {
    return request(`/chat/sendPresence/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        options: {
          delay: delay ?? 1200,
          presence,
        },
      }),
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
          base64: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
      }),
    })
  },

  /** Récupérer la liste des chats/contacts WhatsApp */
  findChats(instanceName: string) {
    return request<Array<{
      id: string
      name?: string
      unreadCount?: number
      lastMsgTimestamp?: number
    }>>(`/chat/findChats/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({}),
      timeout: 30000, // Plus long car peut être lent
    })
  },
}
