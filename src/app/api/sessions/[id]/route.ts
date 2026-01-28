import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** PATCH /api/sessions/[id] — Modifier les paramètres d'une session */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { daily_ai_message_limit } = body as {
    daily_ai_message_limit?: number | null
  }

  const updateData: Record<string, unknown> = {}
  if (daily_ai_message_limit !== undefined) {
    updateData.daily_ai_message_limit = daily_ai_message_limit != null
      ? Math.max(1, Math.min(100000, Math.floor(daily_ai_message_limit)))
      : null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  return NextResponse.json({ data: session })
}
