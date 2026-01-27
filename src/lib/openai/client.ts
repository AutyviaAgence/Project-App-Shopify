import 'server-only'
import OpenAI from 'openai'

/**
 * OpenAI Client — server-only
 */

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (client) return client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[OpenAI] OPENAI_API_KEY is required')
  client = new OpenAI({ apiKey })
  return client
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function generateAgentResponse(params: {
  model: string
  temperature: number
  systemPrompt: string
  messages: ChatMessage[]
}): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    const openai = getClient()
    const response = await openai.chat.completions.create({
      model: params.model,
      temperature: params.temperature,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages,
      ],
      max_tokens: 1024,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { ok: false, error: 'Empty response from OpenAI' }
    }
    return { ok: true, content }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown OpenAI error'
    console.error('[OpenAI] Error:', message)
    return { ok: false, error: message }
  }
}
