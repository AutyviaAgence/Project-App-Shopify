import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const BUCKET = 'knowledge-images'

// Contraintes par type de média (aligné sur les limites WhatsApp Cloud API)
const MEDIA_RULES = {
  image: { maxSize: 5 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], label: 'image (jpeg, png, webp, gif, 5 Mo)' },
  video: { maxSize: 16 * 1024 * 1024, mimes: ['video/mp4', 'video/3gpp'], label: 'vidéo (mp4, 3gp, 16 Mo)' },
  document: { maxSize: 16 * 1024 * 1024, mimes: ['application/pdf'], label: 'document (pdf, 16 Mo)' },
} as const
type MediaKind = keyof typeof MEDIA_RULES
const BUCKET_LIMIT = 16 * 1024 * 1024

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureBucket(admin: any) {
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.some((b: { name: string }) => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: BUCKET_LIMIT })
  }
}

/** GET /api/knowledge-images — Lister les images de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('knowledge_images')
    .select('id, ref, filename, mime_type, storage_path, agent_id, media_kind, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/knowledge-images — Uploader une image avec une ref */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const ref = form.get('ref')?.toString().trim().toLowerCase().replace(/\s+/g, '-')
  const agentId = form.get('agent_id')?.toString() || null
  const mediaKind = (form.get('media_kind')?.toString() || 'image') as MediaKind

  if (!file || !ref) return NextResponse.json({ error: 'Fichier et ref requis' }, { status: 400 })
  const rules = MEDIA_RULES[mediaKind]
  if (!rules) return NextResponse.json({ error: 'Type de média invalide' }, { status: 400 })
  if (!(rules.mimes as readonly string[]).includes(file.type)) return NextResponse.json({ error: `Format non supporté pour ${mediaKind}, attendu : ${rules.label}` }, { status: 400 })
  if (file.size > rules.maxSize) return NextResponse.json({ error: `Fichier trop volumineux (max ${Math.round(rules.maxSize / 1024 / 1024)} Mo pour ${mediaKind})` }, { status: 400 })
  if (!/^[a-z0-9-_]+$/.test(ref)) return NextResponse.json({ error: 'La ref ne peut contenir que des lettres, chiffres, tirets et underscores' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let storagePath: string | null = null
  try {
    await ensureBucket(admin)

    const ext = file.name.split('.').pop() || 'jpg'
    storagePath = `${user.id}/${ref}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[knowledge-images] upload error:', uploadError.message)
      return NextResponse.json({ error: `Upload Storage: ${uploadError.message}` }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from('knowledge_images')
      .upsert({
        user_id: user.id,
        agent_id: agentId || null,
        ref,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type,
        media_kind: mediaKind,
      }, { onConflict: 'user_id,ref' })
      .select()
      .single()

    if (error) {
      console.error('[knowledge-images] db error:', error.message)
      await admin.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: `DB: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[knowledge-images] unexpected error:', err)
    if (storagePath) await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** PATCH /api/knowledge-images — Modifier l'agent associé d'une image */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id, agent_id } = await req.json() as { id: string; agent_id: string | null }
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('knowledge_images')
    .update({ agent_id: agent_id || null })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** DELETE /api/knowledge-images?id=xxx — Supprimer une image */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: img } = await (supabase as any)
    .from('knowledge_images')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!img) return NextResponse.json({ error: 'Image introuvable' }, { status: 404 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await admin.storage.from(BUCKET).remove([img.storage_path])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('knowledge_images').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
