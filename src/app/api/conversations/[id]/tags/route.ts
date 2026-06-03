import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessSession } from '@/lib/teams/access'

async function verifyConversationAccess(supabase: Awaited<ReturnType<typeof createClient>>, conversationId: string, userId: string) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id')
    .eq('id', conversationId)
    .single()

  if (!conv) return false

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id')
    .eq('id', conv.session_id)
    .single()

  if (!session) return false

  return canAccessSession(supabase, userId, session)
}

/** GET /api/conversations/[id]/tags — Liste des tags assignés à une conversation */
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

  const isOwner = await verifyConversationAccess(supabase, id, user.id)
  if (!isOwner) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // FUSION : étiquettes lifecycle assignées (liaison multi)
  const { data: assignments, error } = await supabase
    .from('conversation_lifecycle_stages')
    .select('stage_id')
    .eq('conversation_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const stageIds = assignments.map((a) => a.stage_id)
  const { data: stages } = await supabase
    .from('lifecycle_stages')
    .select('*')
    .in('id', stageIds)

  return NextResponse.json({ data: stages || [] })
}

/** PUT /api/conversations/[id]/tags — Remplacer tous les tags d'une conversation */
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
  const { tag_ids } = body as { tag_ids?: string[] }

  if (!Array.isArray(tag_ids)) {
    return NextResponse.json({ error: 'tag_ids doit être un tableau' }, { status: 400 })
  }

  const isOwner = await verifyConversationAccess(supabase, id, user.id)
  if (!isOwner) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // FUSION : les tag_ids reçus sont des stage_ids lifecycle
  if (tag_ids.length > 0) {
    const { data: validStages } = await supabase
      .from('lifecycle_stages')
      .select('id')
      .eq('user_id', user.id)
      .in('id', tag_ids)

    if (!validStages || validStages.length !== tag_ids.length) {
      return NextResponse.json({ error: 'Une ou plusieurs étiquettes sont invalides' }, { status: 400 })
    }
  }

  // Remplacement atomique des assignations lifecycle
  await supabase
    .from('conversation_lifecycle_stages')
    .delete()
    .eq('conversation_id', id)

  if (tag_ids.length > 0) {
    const { error: insertError } = await supabase
      .from('conversation_lifecycle_stages')
      .insert(
        tag_ids.map((stage_id) => ({
          conversation_id: id,
          stage_id,
        }))
      )

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  // Maj du lien legacy (compat affichage)
  await supabase
    .from('conversations')
    .update({ lifecycle_stage_id: tag_ids[0] || null })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
