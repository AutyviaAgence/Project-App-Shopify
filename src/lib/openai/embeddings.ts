import 'server-only'
import OpenAI from 'openai'
import { logAiUsage } from './usage-log'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (client) return client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[OpenAI] OPENAI_API_KEY is required')
  // Backoff exponentiel intégré du SDK sur 429/5xx : monté à 4 pour éviter qu'un
  // upload RAG (nombreux appels embeddings) échoue en entier sur un pic de 429.
  client = new OpenAI({ apiKey, maxRetries: 4, timeout: 60_000 })
  return client
}

const EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Génère un embedding pour un texte unique.
 */
export async function generateEmbedding(
  text: string
): Promise<{ ok: true; embedding: number[]; tokensUsed: number } | { ok: false; error: string }> {
  try {
    const openai = getClient()
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    })
    void logAiUsage({
      feature: 'embedding',
      model: response.model || EMBEDDING_MODEL,
      promptTokens: response.usage?.total_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    })
    return { ok: true, embedding: response.data[0].embedding, tokensUsed: response.usage?.total_tokens || 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown embedding error'
    console.error('[OpenAI Embedding] Error:', message)
    return { ok: false, error: message }
  }
}

/**
 * Génère des embeddings pour plusieurs textes en un seul appel (batch).
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<{ ok: true; embeddings: number[][]; tokensUsed: number } | { ok: false; error: string }> {
  try {
    const openai = getClient()
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    })
    void logAiUsage({
      feature: 'embedding',
      model: response.model || EMBEDDING_MODEL,
      promptTokens: response.usage?.total_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    })
    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding)
    return { ok: true, embeddings, tokensUsed: response.usage?.total_tokens || 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown embedding error'
    console.error('[OpenAI Embedding] Error:', message)
    return { ok: false, error: message }
  }
}
