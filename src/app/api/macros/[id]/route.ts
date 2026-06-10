import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * PATCH /api/macros/[id] — modifie une macro (ou incrémente usage_count via {used:true}).
 * DELETE /api/macros/[id] — supprime une macro.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Incrément du compteur d'usage (appelé à l'insertion d'une macro dans le chat)
  if (body.used) {
    const { data: m } = await supabase.from('macros').select('usage_count').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (m) {
      await supabase.from('macros').update({ usage_count: (m.usage_count || 0) + 1 }).eq('id', id).eq('user_id', user.id)
    }
    return NextResponse.json({ ok: true })
  }

  const { title, content, shortcut, category } = body as {
    title?: string; content?: string; shortcut?: string; category?: string
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) update.title = title.trim()
  if (content !== undefined) update.content = content.trim()
  if (shortcut !== undefined) update.shortcut = shortcut?.trim() || null
  if (category !== undefined) update.category = category?.trim() || 'general'

  const { data, error } = await supabase
    .from('macros')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { error } = await supabase.from('macros').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
