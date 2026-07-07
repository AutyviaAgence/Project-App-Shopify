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

  /**
   * Envoyer un message interactif avec boutons de réponse rapide (max 3).
   * Message LIBRE (free-form) — valable uniquement dans la fenêtre de 24h,
   * AUCUN template Meta requis. Le clic renvoie un message entrant
   * (button_reply.title) que le webhook reconvertit en message texte.
   *
   * Contraintes Meta : body REQUIS (≤1024), max 3 boutons, title ≤20 car.
   */
  sendInteractiveButtons(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    bodyText: string,
    buttons: { id: string; title: string }[]
  ) {
    const safeButtons = buttons.slice(0, 3).map((b, i) => ({
      type: 'reply' as const,
      reply: {
        id: (b.id || `qr_${i}`).slice(0, 256),
        title: b.title.slice(0, 20),
      },
    }))
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText.slice(0, 1024) },
          action: { buttons: safeButtons },
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

  /** Santé du numéro : qualité (GREEN/YELLOW/RED) + palier d'envoi (TIER_250…).
      Sert au badge santé du dashboard — anticiper les restrictions Meta. */
  getPhoneNumberHealth(phoneNumberId: string, accessToken: string) {
    return request<{
      id: string
      display_phone_number?: string
      quality_rating?: string
      messaging_limit_tier?: string
      /** APPROVED | DECLINED | PENDING… — un nom refusé masque le palier chez Meta. */
      name_status?: string
    }>(`${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,quality_rating,messaging_limit_tier,name_status`, accessToken, {
      method: 'GET',
    })
  },

  // ─── Gestion des templates (Message Templates) ──────────────────────
  // Ces endpoints utilisent le Business Account ID (WABA), pas le phone_number_id.

  /** Lister les templates d'un compte business (avec leur statut Meta) */
  listTemplates(businessAccountId: string, accessToken: string) {
    return request<{
      data: {
        id: string
        name: string
        language: string
        status: string        // APPROVED | PENDING | REJECTED | ...
        category: string      // MARKETING | UTILITY | AUTHENTICATION
        components: unknown[]
      }[]
    }>(`${GRAPH_API_BASE}/${businessAccountId}/message_templates?limit=200`, accessToken, {
      method: 'GET',
    })
  },

  /**
   * Créer (soumettre) un template à Meta pour approbation.
   * `components` suit le format Graph API (BODY, HEADER, FOOTER, BUTTONS).
   */
  createTemplate(
    businessAccountId: string,
    accessToken: string,
    payload: {
      name: string
      language: string
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
      components: unknown[]
    }
  ) {
    return request<{ id: string; status: string; category: string }>(
      `${GRAPH_API_BASE}/${businessAccountId}/message_templates`,
      accessToken,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  },

  /**
   * Éditer un template EXISTANT chez Meta (par son meta_id).
   * Permet de modifier un modèle déjà approuvé/refusé sans en recréer un
   * (Meta refuse un doublon nom+langue). Le modèle repasse en PENDING.
   * On ne peut pas changer le nom ni la langue — seulement category/components.
   */
  editTemplate(
    metaTemplateId: string,
    accessToken: string,
    payload: {
      category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
      components: unknown[]
    }
  ) {
    return request<{ success: boolean }>(
      `${GRAPH_API_BASE}/${metaTemplateId}`,
      accessToken,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  },

  /**
   * Resumable Upload API — obtient un `header_handle` pour un média d'en-tête
   * de template. Meta EXIGE ce handle (une simple URL est refusée → erreur 422).
   *
   * Deux étapes :
   *  1) POST /{app_id}/uploads → crée une session (retourne un upload id)
   *  2) POST /{upload_id} avec les bytes + Authorization: OAuth → retourne { h }
   *
   * Le handle `h` est ensuite passé dans components HEADER.example.header_handle.
   */
  async uploadResumableMedia(
    appId: string,
    accessToken: string,
    params: { buffer: Buffer; mimeType: string; fileName: string }
  ): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
    try {
      // 1) Créer la session d'upload
      const startUrl = `${GRAPH_API_BASE}/${appId}/uploads?file_name=${encodeURIComponent(params.fileName)}&file_length=${params.buffer.length}&file_type=${encodeURIComponent(params.mimeType)}&access_token=${encodeURIComponent(accessToken)}`
      const startRes = await fetch(startUrl, { method: 'POST' })
      const startText = await startRes.text()
      if (!startRes.ok) return { ok: false, error: `upload session: HTTP ${startRes.status}: ${startText}` }
      const startJson = JSON.parse(startText) as { id?: string }
      if (!startJson.id) return { ok: false, error: `upload session: pas d'id (${startText})` }

      // 2) Uploader les bytes (Authorization: OAuth, file_offset: 0)
      const uploadRes = await fetch(`${GRAPH_API_BASE}/${startJson.id}`, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          file_offset: '0',
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(params.buffer),
      })
      const upText = await uploadRes.text()
      if (!uploadRes.ok) return { ok: false, error: `upload bytes: HTTP ${uploadRes.status}: ${upText}` }
      const upJson = JSON.parse(upText) as { h?: string }
      if (!upJson.h) return { ok: false, error: `upload bytes: pas de handle (${upText})` }

      return { ok: true, handle: upJson.h }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'upload exception' }
    }
  },

  /** Supprimer un template par son nom */
  deleteTemplate(businessAccountId: string, accessToken: string, name: string) {
    return request<{ success: boolean }>(
      `${GRAPH_API_BASE}/${businessAccountId}/message_templates?name=${encodeURIComponent(name)}`,
      accessToken,
      { method: 'DELETE' }
    )
  },

  /**
   * Envoyer un template avec variables (composants).
   * `components` au format Graph (ex: [{ type:'body', parameters:[{type:'text',text:'X'}] }]).
   */
  sendTemplateWithParams(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[]
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
          ...(components && components.length > 0 ? { components } : {}),
        },
      }),
    })
  },

  /** Uploader un média vers Meta (retourne un media_id) */
  async uploadMedia(
    phoneNumberId: string,
    accessToken: string,
    buffer: Buffer,
    mimeType: string,
    fileName: string
  ): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
    try {
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
      const formData = new FormData()
      formData.append('file', blob, fileName)
      formData.append('messaging_product', 'whatsapp')
      formData.append('type', mimeType)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/media`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `Upload failed: HTTP ${res.status}: ${text}` }
      }

      const data = await res.json()
      return { ok: true, data: { id: data.id } }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: `Media upload failed: ${message}` }
    }
  },

  /** Envoyer une image via media_id */
  sendImage(phoneNumberId: string, accessToken: string, to: string, mediaId: string, caption?: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { id: mediaId, ...(caption ? { caption } : {}) },
      }),
    })
  },

  /** Envoyer une image via URL publique (pas d'upload). Utile pour les photos produits (CDN Shopify). */
  sendImageByLink(phoneNumberId: string, accessToken: string, to: string, link: string, caption?: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link, ...(caption ? { caption } : {}) },
      }),
    })
  },

  /** Envoyer un audio via media_id */
  sendAudio(phoneNumberId: string, accessToken: string, to: string, mediaId: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'audio',
        audio: { id: mediaId },
      }),
    })
  },

  /** Envoyer un document via media_id */
  sendDocument(phoneNumberId: string, accessToken: string, to: string, mediaId: string, fileName?: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { id: mediaId, ...(fileName ? { filename: fileName } : {}) },
      }),
    })
  },

  /** Envoyer une vidéo via media_id */
  sendVideo(phoneNumberId: string, accessToken: string, to: string, mediaId: string, caption?: string) {
    return request(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'video',
        video: { id: mediaId, ...(caption ? { caption } : {}) },
      }),
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
