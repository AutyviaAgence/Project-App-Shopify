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

  // Récupérer les team_ids depuis la table de liaison
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: documentTeams } = await (supabase as any)
    .from('document_teams')
    .select('team_id')
    .eq('document_id', id)

  const team_ids = documentTeams?.map((dt: { team_id: string }) => dt.team_id) || []

  return NextResponse.json({ data: { ...doc, team_ids } })
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
  const { name, description, text_content, reprocess, team_id, team_ids } = body as {
    name?: string
    description?: string
    text_content?: string
    reprocess?: boolean
    team_id?: string | null
    team_ids?: string[]
  }

  // Support multi-équipes: team_ids ou team_id (legacy)
  const selectedTeamIds = team_ids !== undefined ? team_ids : (team_id !== undefined ? (team_id ? [team_id] : []) : undefined)

  // Si on change d'équipes, vérifier les permissions
  if (selectedTeamIds !== undefined) {
    // Seul le propriétaire peut changer les équipes
    if (existingDoc.user_id !== user.id) {
      return NextResponse.json({ error: 'Seul le propriétaire peut changer les équipes du document' }, { status: 403 })
    }

    // Vérifier la permission dans chaque nouvelle équipe
    for (const tid of selectedTeamIds) {
      const hasNewTeamPermission = await checkTeamPermission(supabase, user.id, tid, 'knowledge_manage')
      if (!hasNewTeamPermission) {
        return NextResponse.json({ error: 'Permission refusée pour une des équipes' }, { status: 403 })
      }
    }
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (text_content !== undefined) updateData.text_content = text_content.trim()

  // Gestion multi-équipes
  if (selectedTeamIds !== undefined) {
    // Mettre à jour la table de liaison
    // 1. Supprimer les anciennes associations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('document_teams').delete().eq('document_id', id)

    // 2. Créer les nouvelles associations
    if (selectedTeamIds.length > 0) {
      const teamAssociations = selectedTeamIds.map(teamId => ({
        document_id: id,
        team_id: teamId,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('document_teams').insert(teamAssociations)
    }

    // Legacy: garder le premier team_id pour compatibilité
    updateData.team_id = selectedTeamIds[0] || null
  }

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
    data: { ...doc, id, team_ids: selectedTeamIds ?? (doc.team_id ? [doc.team_id] : []) }
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
