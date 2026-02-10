import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeMultipleConversations } from '@/lib/openai/lifecycle-analyzer'

/** POST /api/lifecycle/analyze — Analyser une ou plusieurs conversations */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { conversation_ids } = body as { conversation_ids?: string[] }

  if (!Array.isArray(conversation_ids) || conversation_ids.length === 0) {
    return NextResponse.json({ error: 'conversation_ids[] requis' }, { status: 400 })
  }

  // Vérifier que les conversations appartiennent à l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ error: 'Aucune session' }, { status: 404 })
  }

  const sessionIds = sessions.map((s) => s.id)
  const { data: validConvs } = await supabase
    .from('conversations')
    .select('id')
    .in('id', conversation_ids)
    .in('session_id', sessionIds)

  const validIds = (validConvs || []).map((c) => c.id)

  if (validIds.length === 0) {
    return NextResponse.json({ error: 'Aucune conversation valide' }, { status: 404 })
  }

  const results = await analyzeMultipleConversations(validIds, user.id)

  const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0)

  return NextResponse.json({
    data: results,
    total_analyzed: results.length,
    total_tokens: totalTokens,
  })
}
