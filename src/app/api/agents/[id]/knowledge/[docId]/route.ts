import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/agents/[id]/knowledge/[docId]
 * Détache un document d'un agent (supprime le lien agent_knowledge_documents).
 * Le document reste en base ; il n'est juste plus utilisé par cet agent.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Vérifier que l'agent appartient à l'utilisateur
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  if (agent.user_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  await supabase
    .from('agent_knowledge_documents')
    .delete()
    .eq('agent_id', id)
    .eq('document_id', docId)

  return NextResponse.json({ success: true })
}
