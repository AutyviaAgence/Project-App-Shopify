import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/onboarding/checklist — État de chaque étape d'onboarding */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const userId = user.id

  const [
    { data: waSessions },
    { data: agents },
    { data: knowledgeDocs },
    { data: agentTools },
    { data: links },
  ] = await Promise.all([
    supabase.from('whatsapp_sessions').select('id').eq('user_id', userId).eq('status', 'connected').limit(1),
    supabase.from('ai_agents').select('id').eq('user_id', userId).limit(1),
    supabase.from('knowledge_documents').select('id').eq('user_id', userId).limit(1),
    supabase.from('agent_tools').select('id').eq('user_id', userId).limit(1),
    supabase.from('wa_links').select('id').eq('user_id', userId).not('ai_agent_id', 'is', null).limit(1),
  ])

  const whatsapp_connected = (waSessions?.length ?? 0) > 0
  const agent_created = (agents?.length ?? 0) > 0
  const knowledge_created = (knowledgeDocs?.length ?? 0) > 0
  const tool_created = (agentTools?.length ?? 0) > 0
  const link_with_agent = (links?.length ?? 0) > 0

  const all_done = whatsapp_connected && agent_created && knowledge_created && tool_created && link_with_agent

  return NextResponse.json({
    whatsapp_connected,
    agent_created,
    knowledge_created,
    tool_created,
    link_with_agent,
    all_done,
  })
}
