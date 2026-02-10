import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/conversations/[id]/lifecycle — Historique des transitions */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que la conversation appartient à l'utilisateur
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id, lifecycle_stage_id')
    .eq('id', id)
    .single()

  if (!conv) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('user_id')
    .eq('id', conv.session_id)
    .single()

  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer l'historique
  const { data: history, error } = await supabase
    .from('lifecycle_history')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Récupérer les noms des stages pour enrichir l'historique
  const stageIds = [
    ...new Set(
      (history || [])
        .flatMap((h) => [h.from_stage_id, h.to_stage_id])
        .filter(Boolean)
    ),
  ] as string[]

  let stagesMap: Record<string, { name: string; color: string }> = {}
  if (stageIds.length > 0) {
    const { data: stages } = await supabase
      .from('lifecycle_stages')
      .select('id, name, color')
      .in('id', stageIds)
    stagesMap = Object.fromEntries(
      (stages || []).map((s) => [s.id, { name: s.name, color: s.color }])
    )
  }

  const enrichedHistory = (history || []).map((h) => ({
    ...h,
    from_stage: h.from_stage_id ? stagesMap[h.from_stage_id] || null : null,
    to_stage: h.to_stage_id ? stagesMap[h.to_stage_id] || null : null,
  }))

  return NextResponse.json({ data: enrichedHistory })
}

/** PUT /api/conversations/[id]/lifecycle — Changer manuellement le stage */
export async function PUT(
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
  const { stage_id } = body as { stage_id?: string | null }

  // Vérifier que la conversation appartient à l'utilisateur
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id, lifecycle_stage_id')
    .eq('id', id)
    .single()

  if (!conv) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('user_id')
    .eq('id', conv.session_id)
    .single()

  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier que le stage existe (si non-null)
  if (stage_id) {
    const { data: stage } = await supabase
      .from('lifecycle_stages')
      .select('id')
      .eq('id', stage_id)
      .eq('user_id', user.id)
      .single()

    if (!stage) {
      return NextResponse.json({ error: 'Stage introuvable' }, { status: 404 })
    }
  }

  const previousStageId = conv.lifecycle_stage_id

  // Mettre à jour
  await supabase
    .from('conversations')
    .update({ lifecycle_stage_id: stage_id || null })
    .eq('id', id)

  // Insérer dans l'historique
  if (stage_id !== previousStageId) {
    await supabase.from('lifecycle_history').insert({
      conversation_id: id,
      from_stage_id: previousStageId || null,
      to_stage_id: stage_id || null,
      reason: 'Changement manuel',
      changed_by: 'user',
      tokens_used: 0,
    })
  }

  return NextResponse.json({ success: true, stage_id: stage_id || null })
}
