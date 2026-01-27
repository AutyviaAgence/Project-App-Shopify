import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/knowledge/processor'

/** GET /api/knowledge/[id] — Détail d'un document */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  return NextResponse.json({ data: doc })
}

/** PATCH /api/knowledge/[id] — Modifier un document */
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

  const body = await req.json()
  const { name, description, text_content, reprocess } = body as {
    name?: string
    description?: string
    text_content?: string
    reprocess?: boolean
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (text_content !== undefined) updateData.text_content = text_content.trim()

  const needsReprocess = text_content !== undefined || reprocess

  if (Object.keys(updateData).length === 0 && !needsReprocess) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  if (needsReprocess) {
    updateData.status = 'pending'
  }

  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  if (needsReprocess) {
    processDocument(doc.id).catch((err) =>
      console.error('[Knowledge] Reprocess error:', err)
    )
  }

  return NextResponse.json({ data: doc })
}

/** DELETE /api/knowledge/[id] — Supprimer un document */
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

  // Récupérer le document pour nettoyer le storage
  const { data: doc } = await supabase
    .from('knowledge_documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  // Supprimer le fichier storage si PDF
  if (doc.storage_path) {
    await supabase.storage.from('knowledge').remove([doc.storage_path])
  }

  // Supprimer le document (CASCADE supprime chunks et associations)
  const { error } = await supabase
    .from('knowledge_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
