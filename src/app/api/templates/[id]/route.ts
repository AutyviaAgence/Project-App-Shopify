import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/** PATCH /api/templates/[id] — Modifier un brouillon */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  for (const k of ['language', 'category', 'body_text', 'header_text', 'footer_text', 'sample_values', 'header_type', 'header_media_url', 'buttons', 'variable_keys', 'template_type', 'carousel_cards', 'lto_title', 'lto_default_hours'] as const) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (body.body_text !== undefined) {
    const m = (body.body_text as string).match(/\{\{\s*\d+\s*\}\}/g)
    updates.variables_count = m ? Math.max(...m.map((x: string) => parseInt(x.replace(/\D/g, ''), 10))) : 0
  }
  updates.updated_at = new Date().toISOString()

  // Si le contenu (visible par Meta) change sur un template déjà soumis,
  // Meta a toujours l'ancienne version → on repasse en brouillon pour forcer
  // une nouvelle soumission. IMPORTANT : on CONSERVE le meta_id, car la
  // re-soumission éditera le template existant chez Meta (Meta refuse un
  // doublon nom+langue — c'est l'erreur "déjà du contenu en French").
  // Changer le nom ou la langue, en revanche, crée un nouveau template Meta :
  // dans ce cas seulement on efface le meta_id.
  const CONTENT_FIELDS = ['body_text', 'header_text', 'footer_text', 'header_type', 'header_media_url', 'buttons', 'category', 'template_type', 'carousel_cards', 'lto_title', 'lto_default_hours']
  const IDENTITY_FIELDS = ['name', 'language']
  const contentChanged = CONTENT_FIELDS.some((f) => body[f] !== undefined)
  const identityChanged = IDENTITY_FIELDS.some((f) => body[f] !== undefined)

  // Édition manuelle du contenu → cette langue n'est plus "auto-traduite" : on la
  // protège des futures re-traductions (la re-traduction skip is_auto_translated=false).
  if (contentChanged) updates.is_auto_translated = false
  if (contentChanged || identityChanged) {
    const { data: current } = await supabase
      .from('whatsapp_templates')
      .select('status, meta_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (current && current.status !== 'draft') {
      if (identityChanged) {
        // Nom/langue modifiés → c'est un NOUVEAU template Meta : l'ancien meta_id
        // ne vaut plus et il n'y a pas de version approuvée correspondante → draft.
        updates.status = 'draft'
        updates.meta_id = null
        updates.has_pending_changes = false
        updates.rejection_reason = null
      } else if (current.meta_id) {
        // Contenu modifié sur un template DÉJÀ approuvé chez Meta : la version
        // approuvée reste active (et continue d'être envoyée). On NE repasse PAS
        // en draft — on marque seulement des modifications non soumises.
        updates.has_pending_changes = true
        updates.rejection_reason = null
      } else {
        // Pas de meta_id (jamais validé chez Meta) → comportement historique.
        updates.status = 'draft'
        updates.rejection_reason = null
      }
    }
  }

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * PUT /api/templates/[id] — Revenir à la dernière version VALIDÉE par Meta.
 * Restaure le contenu figé lors de la dernière approbation (approved_*).
 * Le template repasse en "approved" (le contenu chez Meta n'a pas changé).
 */
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('id, meta_id, approved_body_text, approved_header_text, approved_footer_text, approved_header_type, approved_header_media_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!tpl) return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 })
  // Une "version validée" n'existe que si le modèle a réellement été approuvé
  // chez Meta (meta_id présent) ET qu'on en a un snapshot.
  if (!tpl.meta_id || !tpl.approved_body_text) {
    return NextResponse.json({ error: "Aucune version validée à restaurer (ce modèle n'a jamais été approuvé)." }, { status: 422 })
  }

  const restored = (tpl.approved_body_text || '')
  const m = restored.match(/\{\{\s*\d+\s*\}\}/g)
  const variables_count = m ? Math.max(...m.map((x) => parseInt(x.replace(/\D/g, ''), 10))) : 0

  // En-tête de la version validée. Si le snapshot n'a pas de type d'en-tête,
  // on retombe sur "texte si header_text présent, sinon aucun" → ça EFFACE un
  // média ajouté après coup.
  const restoredHeaderType = (tpl.approved_header_type || (tpl.approved_header_text ? 'text' : 'none')) as 'none' | 'text' | 'image' | 'video' | 'document'

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .update({
      body_text: tpl.approved_body_text,
      header_text: tpl.approved_header_text,
      footer_text: tpl.approved_footer_text,
      header_type: restoredHeaderType,
      header_media_url: tpl.approved_header_media_url || null,
      variables_count,
      // Le contenu chez Meta correspond à cette version → on est de nouveau approuvé.
      status: tpl.meta_id ? 'approved' : 'draft',
      // On revient à la version approuvée → plus de modifications en attente.
      has_pending_changes: false,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * DELETE /api/templates/[id] — Supprimer un modèle (toutes ses langues).
 *
 * Meta supprime un template PAR NOM, ce qui efface d'un coup toutes ses langues
 * (FR + EN). On aligne donc la base : on supprime TOUTES les lignes du même
 * `name` (sinon une variante d'une autre langue resterait orpheline, pointant
 * vers un template Meta qui n'existe plus).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: template } = await supabase
    .from('whatsapp_templates')
    .select('id, name, status, session_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!template) {
    return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 })
  }

  // Toutes les variantes (langues) de ce modèle, pour cet utilisateur.
  const { data: siblings } = await supabase
    .from('whatsapp_templates')
    .select('id, status, session_id')
    .eq('user_id', user.id)
    .eq('name', template.name)
  const rows = siblings && siblings.length > 0 ? siblings : [template]

  // Si au moins une variante existe côté Meta, supprimer le template chez Meta
  // (par nom → toutes les langues d'un coup). Une seule session suffit.
  const submitted = rows.find((r) => r.status !== 'draft' && r.session_id)
  if (submitted?.session_id) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('waba_business_account_id, waba_access_token')
      .eq('id', submitted.session_id)
      .eq('user_id', user.id)
      .single()
    if (session?.waba_business_account_id && session.waba_access_token) {
      const token = decryptMessage(session.waba_access_token)
      await wabaClient.deleteTemplate(session.waba_business_account_id, token, template.name).catch(() => {})
    }
  }

  // Supprime toutes les langues en base (par nom).
  await supabase.from('whatsapp_templates').delete().eq('user_id', user.id).eq('name', template.name)
  return NextResponse.json({ success: true })
}
