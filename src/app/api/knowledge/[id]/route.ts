import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Récupérer le document
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

  // Récupérer le document pour vérifier les permissions
  const { data: existingDoc } = await supabase
    .from('knowledge_documents')
    .select('user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existingDoc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
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

  // Mise à jour si nécessaire
  let doc = existingDoc
  if (Object.keys(updateData).length > 0 || needsReprocess) {
    if (needsReprocess) {
      updateData.status = 'pending'
    }

    const { data: updatedDoc, error } = await supabase
      .from('knowledge_documents')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updatedDoc) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
    }
    doc = updatedDoc

    if (needsReprocess) {
      import('@/lib/knowledge/processor')
        .then(({ processDocument }) => processDocument(id))
        .catch((err) => console.error('[Knowledge] Reprocess error:', err))
    }
  }

  return NextResponse.json({
    data: { ...doc, id }
  })
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
    .select('user_id, storage_path')
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
