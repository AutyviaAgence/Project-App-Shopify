import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { extractTextFromPDF } from './pdf-parser'
import { chunkText } from './chunker'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { recordTokenUsage } from '@/lib/openai/token-tracker'

const EMBEDDING_BATCH_SIZE = 100

/**
 * Traite un document : extraction texte, chunking, embedding, stockage.
 * Conçu pour être appelé en fire-and-forget après upload.
 * Utilise service_role car exécuté en dehors du contexte auth utilisateur.
 */
export async function processDocument(documentId: string) {
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Statut → processing
    await supabase
      .from('knowledge_documents')
      .update({ status: 'processing', error_message: null })
      .eq('id', documentId)

    // 2. Récupérer le document
    const { data: doc } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (!doc) throw new Error('Document introuvable')

    // 3. Extraire le texte
    let fullText = ''

    if (doc.doc_type === 'text') {
      fullText = doc.text_content || ''
    } else if (doc.doc_type === 'pdf') {
      if (!doc.storage_path) throw new Error('Le PDF n\'a pas de chemin de stockage')

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('knowledge')
        .download(doc.storage_path)

      if (downloadError || !fileData) {
        throw new Error(`Échec du téléchargement PDF : ${downloadError?.message}`)
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const pdfResult = await extractTextFromPDF(buffer)
      if (!pdfResult.ok) throw new Error(pdfResult.error)

      fullText = pdfResult.text
    }

    if (!fullText.trim()) {
      throw new Error('Le document ne contient pas de texte extractible')
    }

    // 4. Découper en chunks
    const chunks = chunkText(fullText)
    if (chunks.length === 0) {
      throw new Error('Le découpage n\'a produit aucun chunk')
    }

    console.log(`[Knowledge] Document ${documentId}: ${chunks.length} chunks`)

    // 5. Supprimer les anciens chunks (pour le re-processing)
    await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', documentId)

    // 6. Générer les embeddings par batch et insérer
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
      const texts = batch.map((c) => c.content)

      const embResult = await generateEmbeddings(texts)
      if (!embResult.ok) {
        throw new Error(`Échec embedding : ${embResult.error}`)
      }

      // Enregistrer l'utilisation des tokens d'embedding
      if (embResult.tokensUsed > 0) {
        await recordTokenUsage(doc.user_id, embResult.tokensUsed)
      }

      const rows = batch.map((chunk, j) => ({
        document_id: documentId,
        user_id: doc.user_id,
        chunk_index: chunk.index,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: JSON.stringify(embResult.embeddings[j]),
      }))

      const { error: insertError } = await supabase
        .from('knowledge_chunks')
        .insert(rows)

      if (insertError) {
        throw new Error(`Échec insertion chunks : ${insertError.message}`)
      }
    }

    // 7. Statut → ready
    await supabase
      .from('knowledge_documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        char_count: fullText.length,
        error_message: null,
      })
      .eq('id', documentId)

    console.log(`[Knowledge] Document ${documentId} traité avec succès`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de traitement inconnue'
    console.error(`[Knowledge] Erreur traitement ${documentId}:`, message)

    await supabase
      .from('knowledge_documents')
      .update({
        status: 'error',
        error_message: message,
      })
      .eq('id', documentId)
  }
}
