import 'server-only'

const DEFAULT_CHUNK_SIZE = 500
const DEFAULT_CHUNK_OVERLAP = 50
const CHARS_PER_TOKEN = 4

interface ChunkResult {
  content: string
  index: number
  tokenCount: number
}

/**
 * Découpe un texte en chunks de ~chunkSize tokens avec overlap.
 * Utilise les limites de paragraphes/phrases quand possible.
 */
export function chunkText(
  text: string,
  chunkSizeTokens: number = DEFAULT_CHUNK_SIZE,
  overlapTokens: number = DEFAULT_CHUNK_OVERLAP
): ChunkResult[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!cleaned) return []

  const chunkSizeChars = chunkSizeTokens * CHARS_PER_TOKEN
  const overlapChars = overlapTokens * CHARS_PER_TOKEN

  const paragraphs = cleaned.split(/\n\n+/)
  const chunks: ChunkResult[] = []
  let currentChunk = ''
  let index = 0

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSizeChars && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index,
        tokenCount: Math.ceil(currentChunk.trim().length / CHARS_PER_TOKEN),
      })
      index++

      if (overlapChars > 0 && currentChunk.length > overlapChars) {
        currentChunk = currentChunk.slice(-overlapChars) + '\n\n' + paragraph
      } else {
        currentChunk = paragraph
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph
    }

    // Gérer les paragraphes plus longs que la taille du chunk
    if (currentChunk.length > chunkSizeChars * 1.5) {
      const sentences = currentChunk.match(/[^.!?]+[.!?]+[\s]*/g) || [currentChunk]
      let sentenceChunk = ''
      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > chunkSizeChars && sentenceChunk.length > 0) {
          chunks.push({
            content: sentenceChunk.trim(),
            index,
            tokenCount: Math.ceil(sentenceChunk.trim().length / CHARS_PER_TOKEN),
          })
          index++
          sentenceChunk = overlapChars > 0 && sentenceChunk.length > overlapChars
            ? sentenceChunk.slice(-overlapChars) + sentence
            : sentence
        } else {
          sentenceChunk += sentence
        }
      }
      currentChunk = sentenceChunk
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index,
      tokenCount: Math.ceil(currentChunk.trim().length / CHARS_PER_TOKEN),
    })
  }

  return chunks
}
