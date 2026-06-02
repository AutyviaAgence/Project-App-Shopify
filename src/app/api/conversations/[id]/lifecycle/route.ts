import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function checkConvAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convId: string,
  userId: string
): Promise<{ conv: { id: string; session_id: string | null; email_session_id: string | null; lifecycle_stage_id: string | null; channel: string } | null; authorized: boolean }> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id, email_session_id, lifecycle_stage_id, channel')
    .eq('id', convId)
    .single()

  if (!conv) return { conv: null, authorized: false }

  if (conv.channel === 'email' || conv.email_session_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emailSession } = await (supabase as any)
      .from('email_sessions')
      .select('user_id')
      .eq('id', conv.email_session_id)
      .single()
    return { conv, authorized: emailSession?.user_id === userId }
  }

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('user_id')
    .eq('id', conv.session_id)
    .single()
  return { conv, authorized: session?.user_id === userId }
}

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

  const { conv, authorized } = await checkConvAccess(supabase, id, user.id)

  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (!authorized) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { data: history, error } = await supabase
    .from('lifecycle_history')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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

/**
 * PUT /api/conversations/[id]/lifecycle — Étiquettes lifecycle MULTIPLES.
 * Body : { stage_ids: string[] } (remplacement atomique de toutes les étiquettes).
 * Rétro-compat : { stage_id: string | null } est accepté (toggle 1 étiquette → set unique).
 */
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
  const { stage_ids, stage_id } = body as { stage_ids?: string[]; stage_id?: string | null }

  const { conv, authorized } = await checkConvAccess(supabase, id, user.id)
  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (!authorized) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Normaliser l'entrée vers une liste d'IDs
  const targetIds: string[] = Array.isArray(stage_ids)
    ? [...new Set(stage_ids.filter(Boolean))]
    : stage_id ? [stage_id] : []

  // Valider que tous les stages appartiennent à l'utilisateur
  if (targetIds.length > 0) {
    const { data: owned } = await supabase
      .from('lifecycle_stages')
      .select('id')
      .eq('user_id', user.id)
      .in('id', targetIds)
    const ownedIds = new Set((owned || []).map((s) => s.id))
    if (targetIds.some((sid) => !ownedIds.has(sid))) {
      return NextResponse.json({ error: 'Étiquette introuvable' }, { status: 404 })
    }
  }

  // État précédent (pour l'historique)
  const { data: prevRows } = await supabase
    .from('conversation_lifecycle_stages')
    .select('stage_id')
    .eq('conversation_id', id)
  const prevIds = new Set((prevRows || []).map((r) => r.stage_id as string))
  const nextIds = new Set(targetIds)

  // Remplacement atomique : delete-all puis insert
  await supabase.from('conversation_lifecycle_stages').delete().eq('conversation_id', id)
  if (targetIds.length > 0) {
    await supabase.from('conversation_lifecycle_stages').insert(
      targetIds.map((sid) => ({ conversation_id: id, stage_id: sid }))
    )
  }

  // Historique : une ligne par ajout / retrait
  const added = [...nextIds].filter((sid) => !prevIds.has(sid))
  const removed = [...prevIds].filter((sid) => !nextIds.has(sid))
  const historyRows = [
    ...added.map((sid) => ({ conversation_id: id, from_stage_id: null, to_stage_id: sid, reason: 'Ajout manuel', changed_by: 'user' as const, tokens_used: 0 })),
    ...removed.map((sid) => ({ conversation_id: id, from_stage_id: sid, to_stage_id: null, reason: 'Retrait manuel', changed_by: 'user' as const, tokens_used: 0 })),
  ]
  if (historyRows.length > 0) {
    await supabase.from('lifecycle_history').insert(historyRows)
  }

  // Maj du lien legacy (compat affichage tant qu'il existe) : 1er stage ou null
  await supabase
    .from('conversations')
    .update({ lifecycle_stage_id: targetIds[0] || null })
    .eq('id', id)

  return NextResponse.json({ success: true, stage_ids: targetIds })
}
