import 'server-only'

/**
 * Extrait le texte d'un buffer PDF.
 * Utilise pdf-parse-fork (compatible Node.js pur, sans dépendance DOM).
 */
export async function extractTextFromPDF(
  buffer: Buffer
): Promise<{ ok: true; text: string; pageCount: number } | { ok: false; error: string }> {
  try {
    const pdfParse = (await import('pdf-parse-fork')).default
    const result = await pdfParse(buffer)
    return {
      ok: true,
      text: result.text,
      pageCount: result.numpages,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown PDF error'
    console.error('[PDF Parser] Error:', message)
    return { ok: false, error: message }
  }
}
