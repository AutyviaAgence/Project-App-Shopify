import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const BUCKET = 'knowledge-images'

/** GET /api/knowledge-images/[id] — URL signée pour preview */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params

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

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(img.storage_path, 3600)

  if (error || !data?.signedUrl) return NextResponse.json({ error: 'URL non générée' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
