import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const BUCKET = 'knowledge-images'
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_SIZE })
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
    .select('id, ref, filename, mime_type, storage_path, agent_id, created_at')
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

  if (!file || !ref) return NextResponse.json({ error: 'Fichier et ref requis' }, { status: 400 })
  if (!ALLOWED_MIME.includes(file.type)) return NextResponse.json({ error: 'Format non supporté (jpeg, png, webp, gif)' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Image trop volumineuse (max 5 Mo)' }, { status: 400 })
  if (!/^[a-z0-9-_]+$/.test(ref)) return NextResponse.json({ error: 'La ref ne peut contenir que des lettres, chiffres, tirets et underscores' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await ensureBucket(admin)

  const ext = file.name.split('.').pop() || 'jpg'
  const storagePath = `${user.id}/${ref}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

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
    }, { onConflict: 'user_id,ref' })
    .select()
    .single()

  if (error) {
    await admin.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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
