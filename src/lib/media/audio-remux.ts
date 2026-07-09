import { spawn } from 'child_process'

/** Conteneurs audio acceptés par WhatsApp Cloud API. */
const WHATSAPP_AUDIO = /^audio\/(aac|mp4|mpeg|amr|ogg)\b/

export function isWhatsAppAudio(mimeType: string): boolean {
  return WHATSAPP_AUDIO.test(mimeType)
}

/**
 * Remuxe un audio WebM/Opus (ce que produit Chrome via MediaRecorder) en
 * OGG/Opus, le seul conteneur Opus accepté par WhatsApp.
 *
 * C'est un simple changement de conteneur : le flux Opus est copié tel quel
 * (`-c:a copy`), sans ré-encodage — donc rapide et sans perte de qualité.
 * Si le flux n'est pas de l'Opus, ffmpeg échoue et on renvoie une erreur
 * plutôt que d'envoyer à Meta un fichier qu'il rejettera.
 */
export async function remuxWebmToOgg(
  input: Buffer
): Promise<{ ok: true; buffer: Buffer<ArrayBuffer>; mimeType: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    // `-i pipe:0` lit stdin, `-f ogg pipe:1` écrit sur stdout.
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-c:a', 'copy',
      '-f', 'ogg',
      'pipe:1',
    ])

    const out: Buffer[] = []
    const err: Buffer[] = []
    ff.stdout.on('data', (c: Buffer) => out.push(c))
    ff.stderr.on('data', (c: Buffer) => err.push(c))

    ff.on('error', (e) => resolve({ ok: false, error: `ffmpeg introuvable : ${e.message}` }))

    ff.on('close', (code) => {
      if (code !== 0 || out.length === 0) {
        const msg = Buffer.concat(err).toString().trim().slice(0, 300)
        return resolve({ ok: false, error: msg || `ffmpeg a échoué (code ${code})` })
      }
      const joined = Buffer.concat(out)
      // Recopie dans un Buffer adossé à un ArrayBuffer « pur » (Buffer.concat
      // renvoie ArrayBufferLike, incompatible avec les signatures en aval).
      const buffer = Buffer.alloc(joined.length)
      joined.copy(buffer)
      resolve({ ok: true, buffer, mimeType: 'audio/ogg' })
    })

    ff.stdin.on('error', () => { /* EPIPE si ffmpeg meurt tôt : géré par 'close' */ })
    ff.stdin.end(input)
  })
}
