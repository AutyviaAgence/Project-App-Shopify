import 'server-only'
import { PDFParse } from 'pdf-parse'

/**
 * Extrait le texte d'un buffer PDF.
 */
export async function extractTextFromPDF(
  buffer: Buffer
): Promise<{ ok: true; text: string; pageCount: number } | { ok: false; error: string }> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    return {
      ok: true,
      text: result.text,
      pageCount: result.total,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown PDF error'
    console.error('[PDF Parser] Error:', message)
    return { ok: false, error: message }
  }
}
