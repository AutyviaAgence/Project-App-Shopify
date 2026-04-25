import 'server-only'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const TIMEOUT = 15000

function isZombieError(error: string): boolean {
  return error.toLowerCase().includes('connection closed')
}

// Quand une session zombie est détectée : marque disconnected en DB + notifie le client + supprime l'instance
async function handleZombieSession(instanceName: string): Promise<void> {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Récupérer l'user_id de la session
    const { data: session } = await admin
      .from('whatsapp_sessions')
      .select('id, user_id, phone_number')
      .eq('instance_name', instanceName)
      .single() as { data: { id: string; user_id: string; phone_number: string | null } | null }

    // 2. Marquer la session comme déconnectée
    await admin
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .eq('instance_name', instanceName)

    // 3. Créer une notification in-app pour le client
    if (session?.user_id) {
      await admin.from('user_alerts').insert({
        user_id: session.user_id,
        alert_type: 'warning',
        title: 'Session WhatsApp déconnectée',
        message: `Votre session WhatsApp${session.phone_number ? ` (+${session.phone_number})` : ''} s'est déconnectée. Reconnectez-vous depuis la page Sessions pour continuer à recevoir des messages.`,
        metadata: { type: 'zombie_session', instance_name: instanceName },
      })
    }

    console.warn(`[Evolution] Zombie session handled: ${instanceName} (user: ${session?.user_id})`)
  } catch (err) {
    console.error(`[Evolution] Failed to handle zombie session ${instanceName}:`, err)
  }

  // 4. Tenter de supprimer via Evolution API
  let deletedByEvolution = false
  try {
    const { url, key } = getConfig()
    const res = await fetch(`${url}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { apikey: key },
    })
    deletedByEvolution = res.ok
  } catch {
    // ignoré
  }

  // 5. Fallback : appeler le service VPS zombie-cleaner si Evolution a échoué
  if (!deletedByEvolution) {
    const cleanerUrl = process.env.ZOMBIE_CLEANER_URL
    const cleanerSecret = process.env.ZOMBIE_CLEANER_SECRET
    if (cleanerUrl && cleanerSecret) {
      try {
        await fetch(`${cleanerUrl}/instance/${encodeURIComponent(instanceName)}`, {
          method: 'DELETE',
          headers: { 'x-zombie-secret': cleanerSecret },
        })
        console.log(`[Evolution] Zombie cleaner VPS called for: ${instanceName}`)
      } catch (err) {
        console.error(`[Evolution] Zombie cleaner VPS failed for ${instanceName}:`, err)
      }
    }
  }
}

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
  async disconnect(instanceName: string) {
    const result = await request(`/instance/logout/${instanceName}`, { method: 'DELETE' })
    if (!result.ok && isZombieError(result.error)) {
      await handleZombieSession(instanceName)
    }
    return result
  },

  /** Restart une instance (recrée la connexion Baileys sans supprimer les données) */
  restartInstance(instanceName: string) {
    return request(`/instance/restart/${instanceName}`, { method: 'PUT' })
  },

  /** Supprimer une instance */
  deleteInstance(instanceName: string) {
    return request(`/instance/delete/${instanceName}`, { method: 'DELETE' })
  },

  /** Envoyer un message texte */
  async sendText(instanceName: string, number: string, text: string) {
    const result = await request(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    })
    if (!result.ok && isZombieError(result.error)) {
      await handleZombieSession(instanceName)
    }
    return result
  },

  /** Envoyer un média (image, audio, document, vidéo) */
  async sendMedia(instanceName: string, number: string, opts: {
    mediatype: 'image' | 'audio' | 'document' | 'video'
    media: string  // base64
    mimetype: string
    caption?: string
    fileName?: string
  }) {
    const result = await request(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        mediatype: opts.mediatype,
        media: opts.media,
        mimetype: opts.mimetype,
        caption: opts.caption,
        fileName: opts.fileName,
      }),
      timeout: 60000,
    })
    if (!result.ok && isZombieError(result.error)) {
      await handleZombieSession(instanceName)
    }
    return result
  },

  /** Envoyer un audio WhatsApp en tant que vocal (PTT) */
  async sendWhatsAppAudio(instanceName: string, number: string, audio: string) {
    const result = await request(`/message/sendWhatsAppAudio/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, audio }),
      timeout: 60000,
    })
    if (!result.ok && isZombieError(result.error)) {
      await handleZombieSession(instanceName)
    }
    return result
  },

  /** Récupérer les infos d'une instance (owner, profileName, etc.) */
  fetchInstance(instanceName: string) {
    return request(`/instance/fetchInstances?instanceName=${instanceName}`, {
      method: 'GET',
    })
  },

  /** Récupérer toutes les instances sur Evolution API */
  fetchAllInstances() {
    return request<Array<{ name: string; connectionStatus: string; ownerJid?: string; id?: string }>>('/instance/fetchInstances', {
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
  async sendPresence(instanceName: string, number: string, presence: 'composing' | 'paused', delay?: number) {
    const result = await request(`/chat/sendPresence/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        options: {
          delay: delay ?? 1200,
          presence,
        },
      }),
    })
    if (!result.ok && isZombieError(result.error)) {
      await handleZombieSession(instanceName)
    }
    return result
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
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        },
      }),
    })
  },

  /** Vérifier si des messages fromMe existent dans un chat (via le store Baileys) */
  async findMessages(instanceName: string, remoteJid: string, opts?: { limit?: number; fromMe?: boolean }): Promise<{ ok: true; data: Array<{ key: { id: string; fromMe: boolean; remoteJid: string }; messageTimestamp?: number }> } | { ok: false; error: string }> {
    const where: Record<string, unknown> = { key: { remoteJid } }
    if (opts?.fromMe !== undefined) {
      where.key = { ...where.key as object, fromMe: opts.fromMe }
    }
    const result = await request<{ messages: { total: number; records: Array<{ key: { id: string; fromMe: boolean; remoteJid: string }; messageTimestamp?: number }> } }>(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where,
        limit: opts?.limit ?? 1,
      }),
      timeout: 10000,
    })
    if (!result.ok) {
      if (isZombieError(result.error)) await handleZombieSession(instanceName)
      return result
    }
    const records = result.data?.messages?.records || []
    return { ok: true, data: records }
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
