import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { generateEmbedding } from '@/lib/openai/embeddings'

const DEFAULT_TOP_K = 5
const DEFAULT_THRESHOLD = 0.7

export type RetrievedChunk = {
  id: string
  document_id: string
  content: string
  chunk_index: number
  similarity: number
}

/**
 * Recherche les chunks pertinents pour une query et un agent donné.
 * Utilise service_role car exécuté depuis le contexte webhook.
 */
export async function retrieveContext(params: {
  agentId: string
  query: string
  topK?: number
  threshold?: number
}): Promise<{ ok: true; chunks: RetrievedChunk[]; context: string } | { ok: false; error: string }> {
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Récupérer les document_ids associés à l'agent
    const { data: agentDocs } = await supabase
      .from('agent_knowledge_documents')
      .select('document_id')
      .eq('agent_id', params.agentId)

    if (!agentDocs || agentDocs.length === 0) {
      return { ok: true, chunks: [], context: '' }
    }

    // Filtrer uniquement les documents prêts
    const documentIds = agentDocs.map((d) => d.document_id)
    const { data: readyDocs } = await supabase
      .from('knowledge_documents')
      .select('id')
      .in('id', documentIds)
      .eq('status', 'ready')

    if (!readyDocs || readyDocs.length === 0) {
      return { ok: true, chunks: [], context: '' }
    }

    const readyDocIds = readyDocs.map((d) => d.id)

    // 2. Générer l'embedding de la query
    const embResult = await generateEmbedding(params.query)
    if (!embResult.ok) {
      return { ok: false, error: embResult.error }
    }

    // 3. Recherche vectorielle via RPC
    const { data: matches, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: JSON.stringify(embResult.embedding),
      match_document_ids: readyDocIds,
      match_threshold: params.threshold ?? DEFAULT_THRESHOLD,
      match_count: params.topK ?? DEFAULT_TOP_K,
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    const chunks: RetrievedChunk[] = (matches || []).map((m: {
      id: string
      document_id: string
      content: string
      chunk_index: number
      similarity: number
    }) => ({
      id: m.id,
      document_id: m.document_id,
      content: m.content,
      chunk_index: m.chunk_index,
      similarity: m.similarity,
    }))

    // 4. Construire le contexte
    const context = chunks.length > 0
      ? chunks.map((c) => c.content).join('\n\n---\n\n')
      : ''

    return { ok: true, chunks, context }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de récupération inconnue'
    console.error('[Knowledge Retriever] Error:', message)
    return { ok: false, error: message }
  }
}
