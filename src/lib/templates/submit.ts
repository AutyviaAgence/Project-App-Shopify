import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'

/**
 * Logique de soumission d'UN modèle à Meta, factorisée pour être appelée EN
 * PROCESS (pas par self-fetch HTTP, qui échoue en self-hosted). Utilisée par la
 * route single-submit ET par la soumission groupée (toutes les langues).
 *
 * Retourne { ok, status, error?, data? } : status = code HTTP que la route
 * renverra ; data = la ligne mise à jour en cas de succès.
 */
export type SubmitResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; token_expired?: boolean }

/** Nombre de variables {{n}} référencées dans un texte. */
function countVars(text: string): number {
  const m = (text || '').match(/\{\{\s*(\d+)\s*\}\}/g)
  if (!m) return 0
  return Math.max(...m.map((x) => parseInt(x.replace(/\D/g, ''), 10)))
}

/**
 * Garde-fou : renumérote les {{n}} d'un texte pour qu'ils soient CONTIGUS à
 * partir de 1, dans l'ordre d'apparition (Meta refuse les trous → "example"
 * invalide). Réaligne les clés et exemples associés.
 */
function normalizeBody(text: string, keys: string[], samples: string[]): {
  text: string; keys: string[]; samples: string[]; count: number
} {
  const order: number[] = []
  const seen = new Set<number>()
  for (const m of (text || '').match(/\{\{\s*\d+\s*\}\}/g) || []) {
    const n = parseInt(m.replace(/\D/g, ''), 10)
    if (!seen.has(n)) { seen.add(n); order.push(n) }
  }
  const remap = new Map<number, number>()
  order.forEach((oldN, i) => remap.set(oldN, i + 1))
  const newText = (text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, d) => `{{${remap.get(parseInt(d, 10))}}}`)
  const newKeys = order.map((oldN) => keys?.[oldN - 1]).filter((k): k is string => !!k)
  const newSamples = order.map((oldN, i) => samples?.[oldN - 1] || newKeys[i] || `exemple${i + 1}`)
  return { text: newText, keys: newKeys, samples: newSamples, count: order.length }
}

/**
 * Soumet un modèle (par id) à Meta. `supabase` doit être authentifié sur l'user
 * (RLS) ; `userId` sert aux filtres explicites.
 */
export async function submitTemplateRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  templateId: string,
  sessionIdOverride?: string
): Promise<SubmitResult> {
  const { data: template } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('id', templateId)
    .eq('user_id', userId)
    .single()

  if (!template) return { ok: false, status: 404, error: 'Modèle introuvable' }

  // Règle Meta : le corps ne peut pas commencer ni finir par une variable {{n}}.
  const trimmedBody = (template.body_text || '').trim()
  const withoutVars = trimmedBody.replace(/\{\{\s*\d+\s*\}\}/g, ' ')
  const startsWithVar = /^[^\p{L}\p{N}]* /u.test(withoutVars)
  const endsWithVar = / [^\p{L}\p{N}]*$/u.test(withoutVars)
  if (startsWithVar || endsWithVar) {
    return { ok: false, status: 422, error: 'Le message ne peut pas commencer ou finir par une variable ({{1}}, {{2}}…). Ajoutez du vrai texte (pas seulement un emoji ou une ponctuation) avant/après la variable.' }
  }

  // Session WABA (celle du template, l'override, ou la première dispo).
  const sessionId = sessionIdOverride || template.session_id
  let sessionQuery = supabase
    .from('whatsapp_sessions')
    .select('id, waba_business_account_id, waba_access_token')
    .eq('user_id', userId)
    .not('waba_business_account_id', 'is', null)
  sessionQuery = sessionId ? sessionQuery.eq('id', sessionId) : sessionQuery.limit(1)
  const { data: session } = await sessionQuery.maybeSingle()

  if (!session?.waba_business_account_id || !session.waba_access_token) {
    return { ok: false, status: 400, error: 'Aucune session WhatsApp Business configurée pour soumettre le modèle' }
  }

  const token = decryptMessage(session.waba_access_token)

  // ── média (bucket privé ou URL) → header_handle Resumable Upload ──
  async function resolveHeaderHandle(src: string): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
    const appId = process.env.META_APP_ID
    if (!appId) return { ok: false, error: 'META_APP_ID non configuré côté serveur.' }
    let buffer: Buffer
    let mimeType = 'application/octet-stream'
    let fileName = 'header'
    try {
      if (/^https?:\/\//i.test(src)) {
        const r = await fetch(src)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        buffer = Buffer.from(await r.arrayBuffer())
        mimeType = r.headers.get('content-type') || mimeType
        fileName = src.split('/').pop()?.split('?')[0] || fileName
      } else {
        const { downloadMediaFromStorage } = await import('@/lib/storage/media')
        const dl = await downloadMediaFromStorage(src)
        if (!dl.ok) throw new Error(dl.error)
        buffer = dl.buffer
        mimeType = dl.mimeType || mimeType
        fileName = src.split('/').pop() || fileName
      }
    } catch (e) {
      return { ok: false, error: `Impossible de lire le média : ${e instanceof Error ? e.message : 'erreur'}` }
    }
    const up = await wabaClient.uploadResumableMedia(appId, token, { buffer, mimeType, fileName })
    if (!up.ok) return { ok: false, error: up.error }
    return { ok: true, handle: up.handle }
  }

  // Composants au format Graph API.
  const components: Record<string, unknown>[] = []

  // HEADER : texte ou média.
  const headerType = template.header_type || (template.header_text ? 'text' : 'none')
  if (headerType === 'text' && template.header_text) {
    components.push({ type: 'HEADER', format: 'TEXT', text: template.header_text })
  } else if ((headerType === 'image' || headerType === 'video' || headerType === 'document') && template.header_media_url) {
    const h = await resolveHeaderHandle(template.header_media_url as string)
    if (!h.ok) {
      console.error('[submit] header handle échec:', h.error)
      return { ok: false, status: 502, error: `Échec de l'envoi du média à Meta : ${h.error.slice(0, 200)}` }
    }
    components.push({ type: 'HEADER', format: headerType.toUpperCase(), example: { header_handle: [h.handle] } })
  }

  // BODY (+ renumérotation garde-fou des {{n}}).
  const norm = normalizeBody(
    template.body_text || '',
    Array.isArray(template.variable_keys) ? template.variable_keys : [],
    Array.isArray(template.sample_values) ? template.sample_values : [],
  )
  if (norm.text !== (template.body_text || '')) {
    await supabase
      .from('whatsapp_templates')
      .update({ body_text: norm.text, variable_keys: norm.keys, sample_values: norm.samples, variables_count: norm.count })
      .eq('id', templateId)
      .eq('user_id', userId)
  }

  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: norm.text }
  if (norm.count > 0) bodyComponent.example = { body_text: [norm.samples] }
  components.push(bodyComponent)
  if (template.footer_text) components.push({ type: 'FOOTER', text: template.footer_text })

  // LIMITED_TIME_OFFER.
  if (template.template_type === 'limited_time_offer') {
    const ltoTitle = (template.lto_title || '').trim()
    if (!ltoTitle) return { ok: false, status: 422, error: 'L’offre à durée limitée doit avoir un titre (ex : « -10% pendant 2h »).' }
    if (template.category !== 'MARKETING') return { ok: false, status: 422, error: 'Une offre à durée limitée doit être en catégorie Marketing (règle Meta).' }
    const hasCode = Array.isArray(template.buttons) && template.buttons.some((b: { type?: string }) => b.type === 'COPY_CODE')
    const hasUrl = Array.isArray(template.buttons) && template.buttons.some((b: { type?: string }) => b.type === 'URL')
    if (!hasCode && !hasUrl) return { ok: false, status: 422, error: 'Une offre à durée limitée doit avoir un bouton « Copier le code » et/ou un bouton lien.' }
    components.push({ type: 'LIMITED_TIME_OFFER', limited_time_offer: { text: ltoTitle, has_expiration: true } })
  }

  // BUTTONS.
  if (Array.isArray(template.buttons) && template.buttons.length > 0) {
    const httpUrl = /^https?:\/\/.+\..+/i
    for (const b of template.buttons as { type: string; text?: string; url?: string; phone?: string; code?: string }[]) {
      if (!b.text || !b.text.trim()) return { ok: false, status: 422, error: 'Chaque bouton doit avoir un libellé.' }
      if (b.type === 'URL') {
        const url = (b.url || '').trim()
        if (!httpUrl.test(url)) return { ok: false, status: 422, error: `Le bouton « ${b.text} » a une URL invalide. Renseignez une adresse complète, ex : https://maboutique.com/suivi` }
      }
      if (b.type === 'PHONE_NUMBER' && !(b.phone || '').trim()) return { ok: false, status: 422, error: `Le bouton « ${b.text} » doit avoir un numéro de téléphone.` }
      if (b.type === 'COPY_CODE' && !(b.code || '').trim()) return { ok: false, status: 422, error: `Le bouton « ${b.text} » doit avoir un code à copier.` }
    }
    const metaButtons = template.buttons.map((b: { type: string; text: string; url?: string; phone?: string; code?: string }) => {
      if (b.type === 'URL') return { type: 'URL', text: b.text.trim(), url: (b.url || '').trim() }
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: (b.phone || '').trim() }
      if (b.type === 'COPY_CODE') return { type: 'COPY_CODE', example: (b.code || '').trim() }
      return { type: 'QUICK_REPLY', text: b.text.trim() }
    })
    components.push({ type: 'BUTTONS', buttons: metaButtons })
  }

  // CAROUSEL.
  if (template.template_type === 'carousel') {
    const cards = Array.isArray(template.carousel_cards) ? template.carousel_cards : []
    if (cards.length === 0) return { ok: false, status: 422, error: 'Un carrousel doit contenir au moins une carte.' }
    if (cards.length > 10) return { ok: false, status: 422, error: 'Un carrousel ne peut pas dépasser 10 cartes.' }

    const httpUrl = /^https?:\/\/.+\..+/i
    const metaCards: Record<string, unknown>[] = []
    for (let ci = 0; ci < cards.length; ci++) {
      const card = cards[ci] as {
        header_type?: 'image' | 'video'; header_media_url?: string | null; body_text?: string
        buttons?: { type: string; text?: string; url?: string }[]; body_variable_keys?: string[]
      }
      const cardComponents: Record<string, unknown>[] = []
      const fmt = (card.header_type || 'image').toUpperCase()
      if (!card.header_media_url) return { ok: false, status: 422, error: `La carte ${ci + 1} doit avoir une image ou vidéo.` }
      const h = await resolveHeaderHandle(card.header_media_url)
      if (!h.ok) {
        console.error(`[submit] carte ${ci + 1} handle échec:`, h.error)
        return { ok: false, status: 502, error: `Carte ${ci + 1} : échec de l'envoi du média à Meta — ${h.error.slice(0, 160)}` }
      }
      cardComponents.push({ type: 'HEADER', format: fmt, example: { header_handle: [h.handle] } })

      const cardBody = (card.body_text || '').trim()
      if (!cardBody) return { ok: false, status: 422, error: `La carte ${ci + 1} doit avoir un texte.` }
      const cardBodyComp: Record<string, unknown> = { type: 'BODY', text: cardBody }
      const cardVarCount = countVars(cardBody)
      if (cardVarCount > 0) {
        const keys = Array.isArray(card.body_variable_keys) ? card.body_variable_keys : []
        const samples = Array.from({ length: cardVarCount }, (_, k) => VARIABLE_BY_KEY[keys[k]]?.sample || `exemple${k + 1}`)
        cardBodyComp.example = { body_text: [samples] }
      }
      cardComponents.push(cardBodyComp)

      const cardButtons = Array.isArray(card.buttons) ? card.buttons : []
      if (cardButtons.length === 0) return { ok: false, status: 422, error: `La carte ${ci + 1} doit avoir au moins un bouton.` }
      const metaCardButtons: Record<string, unknown>[] = []
      for (const b of cardButtons) {
        if (!b.text || !b.text.trim()) return { ok: false, status: 422, error: `Chaque bouton de la carte ${ci + 1} doit avoir un libellé.` }
        if (b.type === 'URL') {
          const url = (b.url || '').trim()
          if (!httpUrl.test(url)) return { ok: false, status: 422, error: `Le bouton « ${b.text} » de la carte ${ci + 1} a une URL invalide.` }
          metaCardButtons.push({ type: 'URL', text: b.text.trim(), url })
        } else {
          metaCardButtons.push({ type: 'QUICK_REPLY', text: b.text.trim() })
        }
      }
      cardComponents.push({ type: 'BUTTONS', buttons: metaCardButtons })
      metaCards.push({ card_index: ci, components: cardComponents })
    }
    components.push({ type: 'CAROUSEL', cards: metaCards })
  }

  // Création ou édition chez Meta.
  let effectiveMetaId = template.meta_id as string | null
  let isEdit = !!effectiveMetaId
  const tplName = template.name as string
  const tplLang = template.language as string
  const tplCategory = template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  const businessAccountId = session.waba_business_account_id as string

  async function doEdit(metaId: string) {
    return wabaClient.editTemplate(metaId, token, { components })
  }
  async function doCreate() {
    return wabaClient.createTemplate(businessAccountId, token, { name: tplName, language: tplLang, category: tplCategory, components })
  }

  let result = isEdit ? await doEdit(effectiveMetaId!) : await doCreate()

  const dupPattern = /already|exists|déjà du contenu|content for this|content in/i
  const userMsgOf = (err: string): string => {
    try {
      const j = err.indexOf('{')
      if (j >= 0) {
        const p = JSON.parse(err.slice(j))
        return p?.error?.error_user_msg || p?.error?.message || ''
      }
    } catch { /* ignore */ }
    return ''
  }
  const isDup = (err: string) => dupPattern.test(err) || dupPattern.test(userMsgOf(err))

  if (!result.ok && isDup(result.error)) {
    const list = await wabaClient.listTemplates(businessAccountId, token)
    if (list.ok) {
      const existing = list.data.data.find((t) => t.name === tplName && t.language === tplLang)
      if (existing?.id) {
        const realId = existing.id
        const wasWrong = realId !== effectiveMetaId
        effectiveMetaId = realId
        isEdit = true
        if (wasWrong) {
          await supabase.from('whatsapp_templates').update({ meta_id: realId }).eq('id', templateId).eq('user_id', userId)
          result = await doEdit(realId)
        }
      }
    }
  }

  if (!result.ok) {
    let metaUserMsg = result.error
    let metaCode: number | undefined
    try {
      const jsonStart = result.error.indexOf('{')
      if (jsonStart >= 0) {
        const parsed = JSON.parse(result.error.slice(jsonStart))
        metaCode = parsed?.error?.code
        metaUserMsg = parsed?.error?.error_user_msg || parsed?.error?.message || result.error
      }
    } catch { /* garde result.error brut */ }

    if (metaCode === 190) {
      return { ok: false, status: 401, token_expired: true, error: 'Votre connexion WhatsApp a expiré. Reconnectez votre numéro (Tableau de bord → Connexion WhatsApp) avec un nouveau token Meta, puis réessayez.' }
    }
    if (/24\s*h|24 heures|once.*24|24.*hour|once in a 24/i.test(result.error) || /24\s*h|24 heures/i.test(metaUserMsg)) {
      return { ok: false, status: 429, error: 'Meta n’autorise qu’une modification par 24 h sur un modèle déjà approuvé. Vous l’avez modifié récemment — réessayez dans 24 h. (La version approuvée reste active en attendant.)' }
    }
    if (isDup(result.error)) {
      return { ok: false, status: 409, error: 'Ce modèle est déjà en attente d’approbation chez Meta (une modification est en cours de revue). Attendez qu’il soit approuvé ou refusé avant de le re-soumettre. Astuce : cliquez sur « Synchroniser » pour rafraîchir son statut.' }
    }
    return { ok: false, status: 422, error: `Meta a refusé le modèle : ${metaUserMsg}` }
  }

  const createData = result.data as { id?: string; status?: string }
  const { data: updated } = await supabase
    .from('whatsapp_templates')
    .update({
      meta_id: isEdit ? effectiveMetaId : createData.id,
      status: (isEdit ? 'PENDING' : (createData.status || 'PENDING')).toLowerCase() as 'pending' | 'approved' | 'rejected',
      session_id: session.id,
      rejection_reason: null,
      has_pending_changes: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .eq('user_id', userId)
    .select()
    .single()

  return { ok: true, status: 200, data: updated }
}
