import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import type { TemplateButton, TemplateCard, CardButton } from '@/types/database'

/**
 * Importe en base les modèles d'un compte WhatsApp Business (WABA) tels qu'ils
 * existent chez Meta. Appelé à la CONNEXION d'une session : permet de voir
 * immédiatement les modèles déjà créés/approuvés sur ce compte, et d'éviter le
 * bug du meta_id obsolète quand on change de WABA (erreur 132001).
 *
 * Source de vérité = Meta : un modèle local du même (name, language) est ÉCRASÉ
 * par la version Meta.
 */

// ── Composants Meta (forme renvoyée par GET /message_templates) ──
type MetaButton = { type: string; text?: string; url?: string; phone_number?: string; example?: string | string[] }
type MetaComponent = {
  type: string // HEADER | BODY | FOOTER | BUTTONS | CAROUSEL | LIMITED_TIME_OFFER
  format?: string // pour HEADER : TEXT | IMAGE | VIDEO | DOCUMENT
  text?: string
  buttons?: MetaButton[]
  example?: { body_text?: string[][]; header_text?: string[]; header_handle?: string[] }
  cards?: { components?: MetaComponent[] }[]
}
type MetaTemplate = {
  id: string
  name: string
  language: string
  status: string // APPROVED | PENDING | REJECTED | ...
  category: string
  components?: MetaComponent[]
}

/** Statut Meta (majuscules) → statut local. */
function mapStatus(s: string): 'approved' | 'pending' | 'rejected' | 'draft' {
  switch ((s || '').toUpperCase()) {
    case 'APPROVED': return 'approved'
    case 'PENDING':
    case 'IN_APPEAL':
    case 'PENDING_DELETION': return 'pending'
    case 'REJECTED':
    case 'DISABLED':
    case 'PAUSED': return 'rejected'
    default: return 'draft'
  }
}

/** Nombre de variables {{n}} d'un texte. */
function countVars(text: string): number {
  const m = (text || '').match(/\{\{\s*(\d+)\s*\}\}/g)
  if (!m) return 0
  return Math.max(...m.map((x) => parseInt(x.replace(/\D/g, ''), 10)))
}

/** Convertit les boutons Meta → boutons Xeyo (message principal). */
function parseButtons(buttons: MetaButton[] | undefined): TemplateButton[] | null {
  if (!buttons || buttons.length === 0) return null
  const out: TemplateButton[] = []
  for (const b of buttons) {
    const type = (b.type || '').toUpperCase()
    if (type === 'URL') out.push({ type: 'URL', text: b.text || '', url: b.url || '' })
    else if (type === 'PHONE_NUMBER') out.push({ type: 'PHONE_NUMBER', text: b.text || '', phone: b.phone_number || '' })
    else if (type === 'COPY_CODE') out.push({ type: 'COPY_CODE', text: b.text || 'Copier le code', code: (Array.isArray(b.example) ? b.example[0] : b.example) || '' })
    else if (type === 'QUICK_REPLY') out.push({ type: 'QUICK_REPLY', text: b.text || '' })
  }
  return out.length > 0 ? out : null
}

/** Convertit les cartes carrousel Meta → cartes Xeyo. */
function parseCards(cards: { components?: MetaComponent[] }[] | undefined): TemplateCard[] | null {
  if (!cards || cards.length === 0) return null
  const out: TemplateCard[] = []
  for (const card of cards) {
    const comps = card.components || []
    const header = comps.find((c) => c.type?.toUpperCase() === 'HEADER')
    const body = comps.find((c) => c.type?.toUpperCase() === 'BODY')
    const btns = comps.find((c) => c.type?.toUpperCase() === 'BUTTONS')
    const cardButtons: CardButton[] = []
    for (const b of btns?.buttons || []) {
      const type = (b.type || '').toUpperCase()
      if (type === 'URL') cardButtons.push({ type: 'URL', text: b.text || '', url: b.url || '' })
      else if (type === 'QUICK_REPLY') cardButtons.push({ type: 'QUICK_REPLY', text: b.text || '' })
    }
    out.push({
      header_type: (header?.format?.toLowerCase() === 'video' ? 'video' : 'image'),
      header_media_url: null, // Meta ne renvoie pas l'URL du média d'exemple → à re-uploader si édité
      body_text: body?.text || '',
      buttons: cardButtons,
      body_variable_keys: [],
    })
  }
  return out
}

/**
 * Reconstruit une ligne whatsapp_templates à partir d'un modèle Meta.
 * Renvoie l'objet à upserter (sans user_id/session_id, ajoutés par l'appelant).
 */
function buildRow(t: MetaTemplate): Record<string, unknown> {
  const comps = t.components || []
  const header = comps.find((c) => c.type?.toUpperCase() === 'HEADER')
  const body = comps.find((c) => c.type?.toUpperCase() === 'BODY')
  const footer = comps.find((c) => c.type?.toUpperCase() === 'FOOTER')
  const buttons = comps.find((c) => c.type?.toUpperCase() === 'BUTTONS')
  const carousel = comps.find((c) => c.type?.toUpperCase() === 'CAROUSEL')
  const lto = comps.find((c) => c.type?.toUpperCase() === 'LIMITED_TIME_OFFER')

  const bodyText = body?.text || ''
  const status = mapStatus(t.status)
  const isApproved = status === 'approved'

  // Type de modèle
  const template_type = carousel ? 'carousel' : lto ? 'limited_time_offer' : 'standard'

  // Header (hors carrousel)
  let header_type: 'none' | 'text' | 'image' | 'video' | 'document' = 'none'
  let header_text: string | null = null
  if (!carousel && header) {
    const fmt = (header.format || 'TEXT').toUpperCase()
    if (fmt === 'TEXT') { header_type = 'text'; header_text = header.text || null }
    else if (fmt === 'IMAGE') header_type = 'image'
    else if (fmt === 'VIDEO') header_type = 'video'
    else if (fmt === 'DOCUMENT') header_type = 'document'
  }

  // Exemples du corps (pour sample_values)
  const sample = body?.example?.body_text?.[0] || []

  const row: Record<string, unknown> = {
    name: t.name,
    language: t.language,
    category: (t.category || 'UTILITY').toUpperCase(),
    body_text: bodyText,
    header_type,
    header_text,
    header_media_url: null, // média non re-téléchargé depuis Meta (re-upload si édité)
    footer_text: carousel ? null : (footer?.text || null),
    buttons: carousel ? null : parseButtons(buttons?.buttons),
    template_type,
    carousel_cards: carousel ? parseCards(carousel.cards) : null,
    lto_title: lto?.text || null,
    lto_default_hours: lto ? 24 : null,
    variables_count: countVars(bodyText),
    sample_values: sample.length > 0 ? sample : null,
    // On ne connaît pas les clés nommées Xeyo depuis Meta → vide. Le dispatch a un
    // fallback par nom (DEFAULT_TEMPLATES) pour les modèles standard connus.
    variable_keys: [],
    status,
    meta_id: t.id,
    rejection_reason: null,
    has_pending_changes: false,
    // Snapshot "version approuvée" si approuvé (pour le bouton restaurer).
    approved_body_text: isApproved ? bodyText : null,
    approved_header_text: isApproved ? header_text : null,
    approved_footer_text: isApproved ? (carousel ? null : footer?.text || null) : null,
    approved_header_type: isApproved ? header_type : null,
    approved_at: isApproved ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  return row
}

/**
 * Importe tous les modèles d'un WABA dans la base, pour un utilisateur donné.
 * Renvoie le nombre de modèles importés/mis à jour.
 */
export async function importTemplatesFromMeta(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  session: { id: string; waba_business_account_id: string | null; waba_access_token: string | null }
): Promise<{ imported: number; error?: string }> {
  if (!session.waba_business_account_id || !session.waba_access_token) {
    return { imported: 0, error: 'session sans WABA' }
  }
  const token = decryptMessage(session.waba_access_token)
  const res = await wabaClient.listTemplates(session.waba_business_account_id, token)
  if (!res.ok) {
    console.error('[meta-import] listTemplates échec:', res.error)
    return { imported: 0, error: res.error }
  }

  const templates = (res.data?.data || []) as MetaTemplate[]
  let imported = 0
  for (const t of templates) {
    try {
      const row = { ...buildRow(t), user_id: userId, session_id: session.id }
      const { error } = await supabase
        .from('whatsapp_templates')
        .upsert(row, { onConflict: 'user_id,name,language' })
      if (error) console.error('[meta-import] upsert échec', t.name, t.language, error.message)
      else imported++
    } catch (e) {
      console.error('[meta-import] parse échec', t.name, e)
    }
  }
  return { imported }
}
