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
  // maxRetries : le SDK OpenAI applique déjà un backoff exponentiel sur les 429
  // (rate limit) et les 5xx/timeouts. On monte à 4 (défaut 2) pour absorber les
  // pics de charge sans perdre de réponses SAV. timeout à 60s par appel.
  client = new OpenAI({ apiKey, maxRetries: 4, timeout: 60_000 })
  return client
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Native OpenAI message type for tool calling conversations */
export type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam

/**
 * Transcrit un audio en texte via Whisper.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ ok: true; text: string; tokensUsed: number } | { ok: false; error: string }> {
  try {
    const openai = getClient()
    const ext = mimeType.includes('ogg') ? 'ogg'
      : mimeType.includes('mp4') ? 'mp4'
      : mimeType.includes('mpeg') ? 'mp3'
      : mimeType.includes('wav') ? 'wav'
      : 'ogg'
    const uint8 = new Uint8Array(audioBuffer)
    const file = new File([uint8], `audio.${ext}`, { type: mimeType })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    })

    // Whisper ne retourne pas de token count — estimation ~100 tokens
    return { ok: true, text: transcription.text, tokensUsed: 100 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Whisper error'
    console.error('[OpenAI Whisper] Error:', message)
    return { ok: false, error: message }
  }
}

/**
 * Décrit une image via GPT-4o Vision.
 */
export async function describeImage(
  base64Data: string,
  mimeType: string = 'image/jpeg'
): Promise<{ ok: true; description: string; tokensUsed: number } | { ok: false; error: string }> {
  try {
    const openai = getClient()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      store: false, // Zero data retention : OpenAI ne conserve pas la requête
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Décris cette image de manière concise. Concentre-toi sur ce qui est montré et tout texte visible.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    })

    const description = response.choices[0]?.message?.content
    if (!description) {
      return { ok: false, error: 'Empty response from Vision' }
    }
    return { ok: true, description, tokensUsed: response.usage?.total_tokens || 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Vision error'
    console.error('[OpenAI Vision] Error:', message)
    return { ok: false, error: message }
  }
}

export type ToolCallResult = {
  toolCallId: string
  functionName: string
  arguments: Record<string, unknown>
}

export async function generateAgentResponse(params: {
  model: string
  temperature: number
  systemPrompt: string
  messages: (ChatMessage | OpenAIMessage)[]
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
}): Promise<
  | { ok: true; content: string; tokensUsed: number; promptTokens: number; completionTokens: number; toolCalls?: undefined }
  | { ok: true; content: null; tokensUsed: number; promptTokens: number; completionTokens: number; toolCalls: ToolCallResult[]; rawMessage: OpenAI.Chat.ChatCompletionMessage }
  | { ok: false; error: string }
> {
  try {
    const openai = getClient()
    const createParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: params.model,
      temperature: params.temperature,
      store: false, // Zero data retention : OpenAI ne conserve pas la requête
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...(params.messages as OpenAI.Chat.ChatCompletionMessageParam[]),
      ],
      max_tokens: 1024,
    }

    if (params.tools && params.tools.length > 0) {
      createParams.tools = params.tools
    }

    const response = await openai.chat.completions.create(createParams)
    const message = response.choices[0]?.message
    const tokensUsed = response.usage?.total_tokens || 0
    const promptTokens = response.usage?.prompt_tokens || 0
    const completionTokens = response.usage?.completion_tokens || 0

    // Handle tool calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: ToolCallResult[] = message.tool_calls
        .filter(tc => tc.type === 'function')
        .map(tc => {
          const fn = (tc as { function: { name: string; arguments: string } }).function
          return {
            toolCallId: tc.id,
            functionName: fn.name,
            arguments: JSON.parse(fn.arguments || '{}'),
          }
        })
      return { ok: true, content: null, tokensUsed, promptTokens, completionTokens, toolCalls, rawMessage: message }
    }

    const content = message?.content
    if (!content) {
      return { ok: false, error: 'Empty response from OpenAI' }
    }
    return { ok: true, content, tokensUsed, promptTokens, completionTokens }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown OpenAI error'
    console.error('[OpenAI] Error:', message)
    return { ok: false, error: message }
  }
}
