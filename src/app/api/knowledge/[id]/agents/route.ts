import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/knowledge/[id]/agents — Liste des agents associés au document */
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

  // Vérifier la propriété du document
  const { data: doc } = await supabase
    .from('knowledge_documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  const { data: associations, error } = await supabase
    .from('agent_knowledge_documents')
    .select('agent_id')
    .eq('document_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: associations?.map((a) => a.agent_id) || [] })
}

/** PUT /api/knowledge/[id]/agents — Remplacer toutes les associations agents */
export async function PUT(
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
  const { agent_ids } = body as { agent_ids: string[] }

  if (!Array.isArray(agent_ids)) {
    return NextResponse.json({ error: 'agent_ids doit être un tableau' }, { status: 400 })
  }

  // Vérifier la propriété du document
  const { data: doc } = await supabase
    .from('knowledge_documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  // Vérifier que tous les agents appartiennent à l'utilisateur
  if (agent_ids.length > 0) {
    const { data: userAgents } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('user_id', user.id)
      .in('id', agent_ids)

    if (!userAgents || userAgents.length !== agent_ids.length) {
      return NextResponse.json({ error: 'Un ou plusieurs agents introuvables' }, { status: 404 })
    }
  }

  // Supprimer les associations existantes
  await supabase
    .from('agent_knowledge_documents')
    .delete()
    .eq('document_id', id)

  // Insérer les nouvelles associations
  if (agent_ids.length > 0) {
    const rows = agent_ids.map((agent_id) => ({
      agent_id,
      document_id: id,
    }))

    const { error: insertError } = await supabase
      .from('agent_knowledge_documents')
      .insert(rows)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data: agent_ids })
}
