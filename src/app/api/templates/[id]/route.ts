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
  for (const k of ['language', 'category', 'body_text', 'header_text', 'footer_text', 'sample_values', 'header_type', 'header_media_url', 'buttons'] as const) {
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
  const CONTENT_FIELDS = ['body_text', 'header_text', 'footer_text', 'header_type', 'header_media_url', 'buttons', 'category']
  const IDENTITY_FIELDS = ['name', 'language']
  const contentChanged = CONTENT_FIELDS.some((f) => body[f] !== undefined)
  const identityChanged = IDENTITY_FIELDS.some((f) => body[f] !== undefined)
  if (contentChanged || identityChanged) {
    const { data: current } = await supabase
      .from('whatsapp_templates')
      .select('status')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (current && current.status !== 'draft') {
      updates.status = 'draft'
      updates.rejection_reason = null
      // Nom/langue modifiés → nouveau template Meta (l'ancien meta_id ne vaut plus)
      if (identityChanged) updates.meta_id = null
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

/** DELETE /api/templates/[id] — Supprimer (local + Meta si soumis) */
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

  // Si le template existe côté Meta, tenter de le supprimer là-bas aussi
  if (template.status !== 'draft' && template.session_id) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('waba_business_account_id, waba_access_token')
      .eq('id', template.session_id)
      .eq('user_id', user.id)
      .single()
    if (session?.waba_business_account_id && session.waba_access_token) {
      const token = decryptMessage(session.waba_access_token)
      await wabaClient.deleteTemplate(session.waba_business_account_id, token, template.name).catch(() => {})
    }
  }

  await supabase.from('whatsapp_templates').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
