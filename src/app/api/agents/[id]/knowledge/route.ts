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

  // Vérifier l'accès à l'agent (propriétaire uniquement)
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  if (agent.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer les document_ids associés
  const { data: associations } = await supabase
    .from('agent_knowledge_documents')
    .select('document_id')
    .eq('agent_id', id)

  if (!associations || associations.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Exclure les documents BOUTIQUE (catalogue/pages/politiques) : ils sont
  // globaux (gérés sur le Dashboard) et inclus automatiquement dans le RAG.
  // La section « Savoir » de l'agent n'affiche que les documents PERSO.
  const { data: stores } = await supabase
    .from('shopify_stores')
    .select('catalog_doc_id, pages_doc_id, policies_doc_id')
    .eq('user_id', agent.user_id)
  const storeDocIds = new Set<string>()
  for (const s of stores || []) {
    for (const docId of [s.catalog_doc_id, s.pages_doc_id, s.policies_doc_id]) {
      if (docId) storeDocIds.add(docId)
    }
  }

  const docIds = associations.map((a) => a.document_id).filter((d) => !storeDocIds.has(d))
  if (docIds.length === 0) {
    return NextResponse.json({ data: [] })
  }
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
