import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/canned-responses — Lister les réponses prédéfinies */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const channel = searchParams.get('channel')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('canned_responses')
    .select('*')
    .eq('user_id', user.id)
    .order('title', { ascending: true })

  if (channel) {
    query = query.contains('channels', [channel])
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

/** POST /api/canned-responses — Créer une réponse prédéfinie */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { title, content, channels, team_id } = body as {
    title?: string
    content?: string
    channels?: string[]
    team_id?: string
  }

  if (!title || !content) {
    return NextResponse.json({ error: 'title et content requis' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('canned_responses')
    .insert({
      user_id: user.id,
      title,
      content,
      channels: channels ?? ['whatsapp', 'email'],
      team_id: team_id ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
