import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

const BUCKET = 'media'

function getAdminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('gif')) return 'gif'
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('msword') || mimeType.includes('docx')) return 'docx'
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) return 'xlsx'
  return 'bin'
}

/** Ensure the media bucket exists (auto-create if missing) */
let bucketChecked = false
async function ensureBucket() {
  if (bucketChecked) return
  const supabase = getAdminClient()
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === BUCKET)
  // 100 Mo : couvre les PDF d'en-tête de template (limite Meta).
  const LIMIT = 100 * 1024 * 1024
  if (!exists) {
    console.log('[MediaStorage] Bucket "media" not found, creating...')
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: LIMIT,
    })
    if (error) {
      console.error('[MediaStorage] Failed to create bucket:', error.message)
      return
    }
    console.log('[MediaStorage] Bucket "media" created successfully')
  } else {
    // S'assure que la limite couvre bien les gros PDF (idempotent).
    await supabase.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: LIMIT }).catch(() => {})
  }
  bucketChecked = true
}

/**
 * Upload un média dans Supabase Storage.
 * Path : {sessionId}/{messageId}.{ext}  (ou path custom via storagePath)
 */
export async function uploadMedia(params: {
  sessionId: string
  messageId: string
  buffer: Buffer
  mimeType: string
  storagePath?: string
}): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> {
  await ensureBucket()

  const ext = getExtensionFromMime(params.mimeType)
  const storagePath = params.storagePath ?? `${params.sessionId}/${params.messageId}.${ext}`

  const supabase = getAdminClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: params.mimeType,
      upsert: true,
    })

  if (error) {
    console.error('[MediaStorage] Upload error:', error.message, '| path:', storagePath, '| size:', params.buffer.length)
    return { ok: false, error: error.message }
  }

  console.log('[MediaStorage] Uploaded:', storagePath, '| size:', params.buffer.length)
  return { ok: true, storagePath }
}

/**
 * Formats autorisés pour les en-têtes de templates WhatsApp (limites Meta).
 * Meta n'accepte que JPG/PNG (image), MP4 (vidéo), PDF (document).
 */
export const TEMPLATE_HEADER_FORMATS = {
  image: {
    mimes: ['image/jpeg', 'image/png'],
    exts: ['jpg', 'jpeg', 'png'],
    maxBytes: 5 * 1024 * 1024, // 5 Mo
  },
  video: {
    mimes: ['video/mp4'],
    exts: ['mp4'],
    maxBytes: 16 * 1024 * 1024, // 16 Mo
  },
  document: {
    mimes: ['application/pdf'],
    exts: ['pdf'],
    maxBytes: 100 * 1024 * 1024, // 100 Mo
  },
} as const

export type TemplateHeaderKind = keyof typeof TEMPLATE_HEADER_FORMATS

/**
 * Upload un média d'en-tête de template dans le bucket privé `media`.
 * Path : template-headers/{userId}/{id}.{ext}
 */
export async function uploadTemplateHeaderMedia(params: {
  userId: string
  kind: TemplateHeaderKind
  fileId: string
  buffer: Buffer
  mimeType: string
}): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> {
  await ensureBucket()
  const ext = getExtensionFromMime(params.mimeType)
  const storagePath = `template-headers/${params.userId}/${params.fileId}.${ext}`

  const supabase = getAdminClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, params.buffer, { contentType: params.mimeType, upsert: true })

  if (error) {
    console.error('[MediaStorage] Template header upload error:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, storagePath }
}

/**
 * Génère une URL signée temporaire pour accéder au média.
 */
export async function getSignedMediaUrl(
  storagePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const supabase = getAdminClient()
  // Support du préfixe "knowledge-images:" pour les images IA
  let bucket = BUCKET
  let path = storagePath
  if (storagePath.startsWith('knowledge-images:')) {
    bucket = 'knowledge-images'
    path = storagePath.slice('knowledge-images:'.length)
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Télécharge un média depuis le storage (pour transcription on-demand).
 */
export async function downloadMediaFromStorage(
  storagePath: string
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; error: string }> {
  // URL EXTERNE (Shopify CDN, etc.) : télécharger directement en HTTP, PAS via le
  // storage Supabase (sinon le SDK préfixe le domaine → « .../media/https://... »
  // invalide, d'où l'erreur « header introuvable » sur les carrousels d'images
  // produit Shopify).
  if (/^https?:\/\//i.test(storagePath)) {
    try {
      const res = await fetch(storagePath)
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} sur ${storagePath}` }
      const buffer = Buffer.from(await res.arrayBuffer())
      const mimeType = res.headers.get('content-type') || 'application/octet-stream'
      return { ok: true, buffer, mimeType }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'download HTTP échoué' }
    }
  }

  // Chemin RELATIF : fichier du bucket storage Supabase.
  const supabase = getAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error || !data) {
    return { ok: false, error: error?.message || 'Download failed' }
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const mimeType = data.type || 'application/octet-stream'
  return { ok: true, buffer, mimeType }
}

/**
 * Supprime des fichiers média du storage en batch.
 * Supabase .remove() supporte les arrays nativement, on batch par 100.
 */
export async function deleteMediaFiles(
  storagePaths: string[]
): Promise<{ deleted: number; errors: number }> {
  if (storagePaths.length === 0) return { deleted: 0, errors: 0 }

  const supabase = getAdminClient()
  let deleted = 0
  let errors = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < storagePaths.length; i += BATCH_SIZE) {
    const batch = storagePaths.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .remove(batch)

    if (error) {
      console.error('[MediaStorage] Batch delete error:', error.message)
      errors += batch.length
    } else {
      deleted += data?.length || batch.length
    }
  }

  console.log(`[MediaStorage] Deleted ${deleted} files, ${errors} errors`)
  return { deleted, errors }
}
