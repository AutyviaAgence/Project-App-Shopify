declare module 'pdf-parse-fork' {
  interface PDFParseResult {
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: Record<string, unknown> | null
    text: string
    version: string
  }

  function pdfParse(
    dataBuffer: Buffer | ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<PDFParseResult>

  export default pdfParse
}
