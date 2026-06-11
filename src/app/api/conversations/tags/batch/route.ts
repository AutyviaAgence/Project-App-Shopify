import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
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

  // FUSION : on lit désormais les étiquettes lifecycle (liaison multi)
  const { data: assignments } = await supabase
    .from('conversation_lifecycle_stages')
    .select('conversation_id, stage_id')
    .in('conversation_id', validConvIds)

  if (!assignments || assignments.length === 0) {
    const result: Record<string, []> = {}
    validConvIds.forEach(id => { result[id] = [] })
    return NextResponse.json({ data: result })
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
    if (stage && result[a.conversation_id]) {
      result[a.conversation_id].push(stage)
    }
  })

  return NextResponse.json({ data: result })
}
