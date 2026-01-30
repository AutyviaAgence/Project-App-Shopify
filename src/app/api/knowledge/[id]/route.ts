import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkTeamPermission } from '@/lib/teams/access'

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

  // Récupérer le document (RLS gère l'accès de base)
  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  // Vérifier la permission pour les documents d'équipe
  if (doc.team_id && doc.user_id !== user.id) {
    const hasPermission = await checkTeamPermission(supabase, user.id, doc.team_id, 'knowledge_view')
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission refusée' }, { status: 403 })
    }
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
    .select('user_id, team_id')
    .eq('id', id)
    .single()

  if (!existingDoc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  // Vérifier la permission de modification
  if (existingDoc.team_id && existingDoc.user_id !== user.id) {
    const hasPermission = await checkTeamPermission(supabase, user.id, existingDoc.team_id, 'knowledge_manage')
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission refusée' }, { status: 403 })
    }
  } else if (existingDoc.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, text_content, reprocess, team_id } = body as {
    name?: string
    description?: string
    text_content?: string
    reprocess?: boolean
    team_id?: string | null
  }

  // Si on change de team_id, vérifier la permission dans la nouvelle équipe
  if (team_id !== undefined && team_id !== existingDoc.team_id) {
    // Si on déplace vers une équipe, vérifier qu'on a la permission
    if (team_id) {
      const hasNewTeamPermission = await checkTeamPermission(supabase, user.id, team_id, 'knowledge_manage')
      if (!hasNewTeamPermission) {
        return NextResponse.json({ error: 'Permission refusée pour cette équipe' }, { status: 403 })
      }
    }
    // Seul le propriétaire peut déplacer un document personnel vers une équipe ou inversement
    if (existingDoc.user_id !== user.id) {
      return NextResponse.json({ error: 'Seul le propriétaire peut changer l\'équipe du document' }, { status: 403 })
    }
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (text_content !== undefined) updateData.text_content = text_content.trim()
  if (team_id !== undefined) updateData.team_id = team_id || null

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
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  if (needsReprocess) {
    import('@/lib/knowledge/processor')
      .then(({ processDocument }) => processDocument(doc.id))
      .catch((err) => console.error('[Knowledge] Reprocess error:', err))
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

  // Récupérer le document pour vérifier les permissions et nettoyer le storage
  const { data: doc } = await supabase
    .from('knowledge_documents')
    .select('user_id, team_id, storage_path')
    .eq('id', id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  // Vérifier la permission de modification
  if (doc.team_id && doc.user_id !== user.id) {
    const hasPermission = await checkTeamPermission(supabase, user.id, doc.team_id, 'knowledge_manage')
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permission refusée' }, { status: 403 })
    }
  } else if (doc.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
