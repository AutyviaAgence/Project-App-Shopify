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

  // Récupérer les tag_ids assignés
  const { data: assignments, error } = await supabase
    .from('conversation_tag_assignments')
    .select('tag_id')
    .eq('conversation_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Récupérer les infos des tags
  const tagIds = assignments.map((a) => a.tag_id)
  const { data: tags } = await supabase
    .from('conversation_tags')
    .select('*')
    .in('id', tagIds)

  return NextResponse.json({ data: tags || [] })
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

  // Vérifier que tous les tags appartiennent à l'utilisateur
  if (tag_ids.length > 0) {
    const { data: validTags } = await supabase
      .from('conversation_tags')
      .select('id')
      .eq('user_id', user.id)
      .in('id', tag_ids)

    if (!validTags || validTags.length !== tag_ids.length) {
      return NextResponse.json({ error: 'Un ou plusieurs tags sont invalides' }, { status: 400 })
    }
  }

  // Supprimer les assignations existantes
  await supabase
    .from('conversation_tag_assignments')
    .delete()
    .eq('conversation_id', id)

  // Créer les nouvelles assignations
  if (tag_ids.length > 0) {
    const { error: insertError } = await supabase
      .from('conversation_tag_assignments')
      .insert(
        tag_ids.map((tag_id) => ({
          conversation_id: id,
          tag_id,
        }))
      )

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
