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
  // une nouvelle soumission (sinon l'ancienne version serait envoyée).
  const CONTENT_FIELDS = ['body_text', 'header_text', 'footer_text', 'header_type', 'header_media_url', 'buttons', 'category', 'language']
  const contentChanged = CONTENT_FIELDS.some((f) => body[f] !== undefined)
  if (contentChanged) {
    const { data: current } = await supabase
      .from('whatsapp_templates')
      .select('status')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (current && current.status !== 'draft') {
      updates.status = 'draft'
      updates.meta_id = null
      updates.rejection_reason = null
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
