import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamPermissions, checkTeamPermission } from '@/lib/teams/access'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanQuota } from '@/lib/plan-quota'

/** GET /api/knowledge — Lister les documents de l'utilisateur (+ équipes avec permission) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les permissions de l'utilisateur dans ses équipes
  const permissions = await getUserTeamPermissions(supabase, user.id)

  // Filtrer les équipes où l'utilisateur peut voir la base de connaissances
  const allowedTeamIds = permissions
    .filter((p) => p.role === 'owner' || p.role === 'admin' || p.can_view_knowledge)
    .map((p) => p.team_id)

  // Construire le filtre d'accès
  const accessFilter = allowedTeamIds.length > 0
    ? `user_id.eq.${user.id},team_id.in.(${allowedTeamIds.join(',')})`
    : `user_id.eq.${user.id}`

  const { data: documents, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .or(accessFilter)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Récupérer les team_ids pour chaque document depuis la table de liaison
  if (documents && documents.length > 0) {
    const documentIds = documents.map(d => d.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: documentTeams } = await (supabase as any)
      .from('document_teams')
      .select('document_id, team_id')
      .in('document_id', documentIds)

    // Créer une map document_id -> team_ids
    const teamsByDocument = new Map<string, string[]>()
    if (documentTeams) {
      for (const dt of documentTeams as { document_id: string; team_id: string }[]) {
        const existing = teamsByDocument.get(dt.document_id) || []
        existing.push(dt.team_id)
        teamsByDocument.set(dt.document_id, existing)
      }
    }

    // Ajouter team_ids à chaque document
    const documentsWithTeamIds = documents.map(doc => ({
      ...doc,
      team_ids: teamsByDocument.get(doc.id) || (doc.team_id ? [doc.team_id] : [])
    }))

    return NextResponse.json({ data: documentsWithTeamIds })
  }

  return NextResponse.json({ data: documents })
}

/** POST /api/knowledge — Créer un document (texte JSON ou PDF multipart) */
export async function POST(req: NextRequest) {
  // Rate limiting (10/min car opération lourde)
  const rateLimitResponse = checkRateLimit(req, 'HEAVY')
  if (rateLimitResponse) return rateLimitResponse

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier le quota de documents selon le plan
  const docQuota = await checkPlanQuota(supabase, user.id, 'docs')
  if (!docQuota.allowed) {
    const error = docQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour ajouter des documents.'
      : docQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour ajouter un document. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${docQuota.plan} inclut ${docQuota.limit} document(s) RAG. Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: docQuota.reason,
      limit: docQuota.limit,
      current: docQuota.current,
    }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    // Upload PDF
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null
    const description = formData.get('description') as string | null
    const team_id = formData.get('team_id') as string | null
    const team_ids_raw = formData.get('team_ids') as string | null

    // Support multi-équipes: team_ids (JSON array) ou team_id (legacy)
    let selectedTeamIds: string[] = []
    if (team_ids_raw) {
      try {
        selectedTeamIds = JSON.parse(team_ids_raw)
      } catch {
        selectedTeamIds = []
      }
    } else if (team_id) {
      selectedTeamIds = [team_id]
    }

    if (!file || !name?.trim()) {
      return NextResponse.json({ error: 'Fichier et nom requis' }, { status: 400 })
    }

    // Vérifier que l'utilisateur a la permission de gérer la knowledge dans les équipes
    if (selectedTeamIds.length > 0) {
      for (const tid of selectedTeamIds) {
        const hasPermission = await checkTeamPermission(supabase, user.id, tid, 'knowledge_manage')
        if (!hasPermission) {
          return NextResponse.json({ error: 'Permission refusée pour une des équipes' }, { status: 403 })
        }
      }
    }

    if (!file.name.endsWith('.pdf') || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 })
    }

    // Upload vers Supabase Storage
    // Sanitize filename: remove accents, replace special chars with underscores
    const sanitizedName = file.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars (spaces, parens, etc.)
      .replace(/_+/g, '_') // Collapse multiple underscores
    const storagePath = `${user.id}/${Date.now()}_${sanitizedName}`
    const { error: uploadError } = await supabase.storage
      .from('knowledge')
      .upload(storagePath, file, { contentType: 'application/pdf' })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Créer le document
    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({
        user_id: user.id,
        team_id: selectedTeamIds[0] || null, // Legacy: premier team_id
        name: name.trim(),
        description: description?.trim() || null,
        doc_type: 'pdf',
        storage_path: storagePath,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Créer les associations multi-équipes
    if (selectedTeamIds.length > 0 && doc) {
      const teamAssociations = selectedTeamIds.map(teamId => ({
        document_id: doc.id,
        team_id: teamId,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('document_teams').insert(teamAssociations)
    }

    // Fire-and-forget : traitement en arrière-plan
    import('@/lib/knowledge/processor')
      .then(({ processDocument }) => processDocument(doc.id))
      .catch((err) => console.error('[Knowledge] Background process error:', err))

    return NextResponse.json({ data: { ...doc, team_ids: selectedTeamIds } })
  } else {
    // Document texte (JSON)
    const body = await req.json()
    const { name, description, text_content, team_id, team_ids } = body as {
      name?: string
      description?: string
      text_content?: string
      team_id?: string
      team_ids?: string[]
    }

    // Support multi-équipes: team_ids ou team_id (legacy)
    const selectedTeamIds = team_ids || (team_id ? [team_id] : [])

    if (!name?.trim() || !text_content?.trim()) {
      return NextResponse.json({ error: 'Nom et contenu requis' }, { status: 400 })
    }

    // Vérifier que l'utilisateur a la permission de gérer la knowledge dans les équipes
    if (selectedTeamIds.length > 0) {
      for (const tid of selectedTeamIds) {
        const hasPermission = await checkTeamPermission(supabase, user.id, tid, 'knowledge_manage')
        if (!hasPermission) {
          return NextResponse.json({ error: 'Permission refusée pour une des équipes' }, { status: 403 })
        }
      }
    }

    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({
        user_id: user.id,
        team_id: selectedTeamIds[0] || null, // Legacy: premier team_id
        name: name.trim(),
        description: description?.trim() || null,
        doc_type: 'text',
        text_content: text_content.trim(),
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Créer les associations multi-équipes
    if (selectedTeamIds.length > 0 && doc) {
      const teamAssociations = selectedTeamIds.map(teamId => ({
        document_id: doc.id,
        team_id: teamId,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('document_teams').insert(teamAssociations)
    }

    // Fire-and-forget
    import('@/lib/knowledge/processor')
      .then(({ processDocument }) => processDocument(doc.id))
      .catch((err) => console.error('[Knowledge] Background process error:', err))

    return NextResponse.json({ data: { ...doc, team_ids: selectedTeamIds } })
  }
}
