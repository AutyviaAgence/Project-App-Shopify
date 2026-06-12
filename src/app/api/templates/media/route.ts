import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  uploadTemplateHeaderMedia,
  getSignedMediaUrl,
  TEMPLATE_HEADER_FORMATS,
  type TemplateHeaderKind,
} from '@/lib/storage/media'

/**
 * POST /api/templates/media
 * Upload d'un média d'en-tête de template (image JPG/PNG, vidéo MP4, doc PDF)
 * dans le bucket privé `media` (sous-dossier template-headers/{userId}).
 *
 * Body: FormData { file, kind: 'image'|'video'|'document' }
 * Retourne: { storage_path, signed_url, filename, mime_type }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const kind = (form.get('kind')?.toString() || '') as TemplateHeaderKind

  if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
  const rule = TEMPLATE_HEADER_FORMATS[kind]
  if (!rule) {
    return NextResponse.json({ error: 'Type d\'en-tête invalide (image, video ou document)' }, { status: 400 })
  }

  // Validation stricte du format (Meta n'accepte que JPG/PNG, MP4, PDF).
  const mime = file.type || ''
  if (!(rule.mimes as readonly string[]).includes(mime)) {
    const labels = { image: 'JPG ou PNG', video: 'MP4', document: 'PDF' }[kind]
    return NextResponse.json({ error: `Format non supporté. Formats acceptés : ${labels}.` }, { status: 400 })
  }
  if (file.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / (1024 * 1024))
    return NextResponse.json({ error: `Fichier trop volumineux (max ${mb} Mo).` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  // fileId déterministe par timestamp (pas de Math.random côté serveur ici, on
  // s'appuie sur Date.now du runtime Next, autorisé hors workflow).
  const fileId = `${Date.now()}`

  const up = await uploadTemplateHeaderMedia({
    userId: user.id,
    kind,
    fileId,
    buffer,
    mimeType: mime,
  })
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 500 })

  // URL signée (1h) pour l'aperçu immédiat côté UI.
  const signedUrl = await getSignedMediaUrl(up.storagePath, 3600)

  return NextResponse.json({
    data: {
      storage_path: up.storagePath,
      signed_url: signedUrl,
      filename: file.name,
      mime_type: mime,
    },
  })
}
