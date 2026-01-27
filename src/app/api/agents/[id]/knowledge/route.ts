import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/agents/[id]/knowledge — Liste des documents associés à un agent */
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

  // Vérifier la propriété de l'agent
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  // Récupérer les document_ids associés
  const { data: associations } = await supabase
    .from('agent_knowledge_documents')
    .select('document_id')
    .eq('agent_id', id)

  if (!associations || associations.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const docIds = associations.map((a) => a.document_id)
  const { data: documents, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .in('id', docIds)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: documents || [] })
}
