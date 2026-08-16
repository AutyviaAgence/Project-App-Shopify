import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getScopedClient } from '@/lib/admin/impersonation'

/**
 * GET /api/macros — liste les macros de l'utilisateur (triées par usage).
 * POST /api/macros — crée une macro.
 */
// IMPERSONATION : données de l'utilisateur EFFECTIF (getScopedClient).
export async function GET() {
  const scoped = await getScopedClient()
  if (!scoped) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { supabase, userId } = scoped

  const { data, error } = await supabase
    .from('macros')
    .select('*')
    .eq('user_id', userId)
    .order('usage_count', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { title, content, shortcut, category } = body as {
    title?: string; content?: string; shortcut?: string; category?: string
  }
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Titre et contenu requis' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('macros')
    .insert({
      user_id: user.id,
      title: title.trim(),
      content: content.trim(),
      shortcut: shortcut?.trim() || null,
      category: category?.trim() || 'general',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
