import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessSession } from '@/lib/teams/access'

/** Vérifie l'accès et renvoie l'user_id propriétaire de la session (référentiel
 * des étiquettes), ou null si pas d'accès. */
async function resolveConversationOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string
): Promise<string | null> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, session_id')
    .eq('id', conversationId)
    .single()

  if (!conv) return null

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id')
    .eq('id', conv.session_id)
    .single()

  if (!session) return null

  const hasAccess = await canAccessSession(supabase, userId, session)
  return hasAccess ? session.user_id : null
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

  const ownerId = await resolveConversationOwner(supabase, id, user.id)
  if (!ownerId) {
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

  const ownerId = await resolveConversationOwner(supabase, id, user.id)
  if (!ownerId) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // FUSION : les tag_ids reçus sont des stage_ids lifecycle. Le référentiel
  // d'étiquettes est celui du propriétaire de la session (pas du membre qui
  // applique), pour fonctionner aussi en accès équipe.
  if (tag_ids.length > 0) {
    const { data: validStages } = await supabase
      .from('lifecycle_stages')
      .select('id')
      .eq('user_id', ownerId)
      .in('id', tag_ids)

    if (!validStages || validStages.length !== tag_ids.length) {
      return NextResponse.json({ error: 'Une ou plusieurs étiquettes sont invalides' }, { status: 400 })
    }
  }

  // Remplacement atomique des assignations lifecycle
  const { error: deleteError } = await supabase
    .from('conversation_lifecycle_stages')
    .delete()
    .eq('conversation_id', id)

  if (deleteError) {
    console.error('[lifecycle tags PUT] delete error:', deleteError)
    return NextResponse.json({ error: deleteError.message, code: deleteError.code }, { status: 500 })
  }

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
      console.error('[lifecycle tags PUT] insert error:', insertError)
      return NextResponse.json({ error: insertError.message, code: insertError.code }, { status: 500 })
    }
  }

  // Maj du lien legacy (compat affichage)
  const { error: updateError } = await supabase
    .from('conversations')
    .update({ lifecycle_stage_id: tag_ids[0] || null })
    .eq('id', id)

  if (updateError) {
    console.error('[lifecycle tags PUT] legacy update error:', updateError)
    return NextResponse.json({ error: updateError.message, code: updateError.code }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
