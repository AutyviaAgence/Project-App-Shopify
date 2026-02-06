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

export async function generateAgentResponse(params: {
  model: string
  temperature: number
  systemPrompt: string
  messages: ChatMessage[]
}): Promise<{ ok: true; content: string; tokensUsed: number } | { ok: false; error: string }> {
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
    return { ok: true, content, tokensUsed: response.usage?.total_tokens || 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown OpenAI error'
    console.error('[OpenAI] Error:', message)
    return { ok: false, error: message }
  }
}
