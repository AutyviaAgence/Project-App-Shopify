import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds } from '@/lib/teams/access'

/** POST /api/conversations/tags/batch — Récupérer les tags de plusieurs conversations */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { conversation_ids } = body as { conversation_ids?: string[] }

  if (!Array.isArray(conversation_ids) || conversation_ids.length === 0) {
    return NextResponse.json({ data: {} })
  }

  // Limiter à 100 conversations max
  const limitedIds = conversation_ids.slice(0, 100)

  // Récupérer les équipes de l'utilisateur pour vérifier l'accès
  const teamIds = await getUserTeamIds(supabase, user.id)

  // Récupérer les sessions auxquelles l'utilisateur a accès
  let sessionsQuery = supabase
    .from('whatsapp_sessions')
    .select('id')

  if (teamIds.length > 0) {
    sessionsQuery = sessionsQuery.or(`user_id.eq.${user.id},team_id.in.(${teamIds.join(',')})`)
  } else {
    sessionsQuery = sessionsQuery.eq('user_id', user.id)
  }

  const { data: sessions } = await sessionsQuery
  const sessionIds = (sessions || []).map(s => s.id)

  if (sessionIds.length === 0) {
    return NextResponse.json({ data: {} })
  }

  // Récupérer les conversations qui appartiennent à ces sessions
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .in('id', limitedIds)
    .in('session_id', sessionIds)

  const validConvIds = (conversations || []).map(c => c.id)

  if (validConvIds.length === 0) {
    return NextResponse.json({ data: {} })
  }

  // Récupérer les assignations de tags pour ces conversations
  const { data: assignments } = await supabase
    .from('conversation_tag_assignments')
    .select('conversation_id, tag_id')
    .in('conversation_id', validConvIds)

  if (!assignments || assignments.length === 0) {
    // Retourner un objet vide pour chaque conversation
    const result: Record<string, []> = {}
    validConvIds.forEach(id => { result[id] = [] })
    return NextResponse.json({ data: result })
  }

  // Récupérer les infos des tags
  const tagIds = [...new Set(assignments.map(a => a.tag_id))]
  const { data: tags } = await supabase
    .from('conversation_tags')
    .select('*')
    .in('id', tagIds)

  const tagsArray = tags || []
  const tagsMap = Object.fromEntries(tagsArray.map(t => [t.id, t]))

  // Construire le résultat groupé par conversation
  type TagType = typeof tagsArray[number]
  const result: Record<string, TagType[]> = {}
  validConvIds.forEach(id => { result[id] = [] })

  assignments.forEach(a => {
    const tag = tagsMap[a.tag_id]
    if (tag && result[a.conversation_id]) {
      result[a.conversation_id].push(tag)
    }
  })

  return NextResponse.json({ data: result })
}
