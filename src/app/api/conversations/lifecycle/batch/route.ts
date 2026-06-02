import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, buildAccessFilter } from '@/lib/teams/access'

/** POST /api/conversations/lifecycle/batch — Étiquettes lifecycle de plusieurs conversations */
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

  const limitedIds = conversation_ids.slice(0, 100)
  const teamIds = await getUserTeamIds(supabase, user.id)

  let sessionsQuery = supabase.from('whatsapp_sessions').select('id')
  if (teamIds.length > 0) {
    sessionsQuery = sessionsQuery.or(buildAccessFilter(user.id, teamIds))
  } else {
    sessionsQuery = sessionsQuery.eq('user_id', user.id)
  }
  const { data: sessions } = await sessionsQuery
  const sessionIds = (sessions || []).map(s => s.id)
  if (sessionIds.length === 0) return NextResponse.json({ data: {} })

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .in('id', limitedIds)
    .in('session_id', sessionIds)
  const validConvIds = (conversations || []).map(c => c.id)
  if (validConvIds.length === 0) return NextResponse.json({ data: {} })

  // Assignations lifecycle (liaison multi)
  const { data: assignments } = await supabase
    .from('conversation_lifecycle_stages')
    .select('conversation_id, stage_id')
    .in('conversation_id', validConvIds)

  if (!assignments || assignments.length === 0) {
    const empty: Record<string, []> = {}
    validConvIds.forEach(id => { empty[id] = [] })
    return NextResponse.json({ data: empty })
  }

  const stageIds = [...new Set(assignments.map(a => a.stage_id))]
  const { data: stages } = await supabase
    .from('lifecycle_stages')
    .select('*')
    .in('id', stageIds)

  const stagesArray = stages || []
  const stagesMap = Object.fromEntries(stagesArray.map(s => [s.id, s]))

  type StageType = typeof stagesArray[number]
  const result: Record<string, StageType[]> = {}
  validConvIds.forEach(id => { result[id] = [] })
  assignments.forEach(a => {
    const stage = stagesMap[a.stage_id]
    if (stage && result[a.conversation_id]) result[a.conversation_id].push(stage)
  })

  return NextResponse.json({ data: result })
}
