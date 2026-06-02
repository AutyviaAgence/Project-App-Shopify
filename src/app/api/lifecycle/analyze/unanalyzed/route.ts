import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeMultipleConversations } from '@/lib/openai/lifecycle-analyzer'
import { canUseAiAnalysis } from '@/lib/subscription/plan'

/** GET /api/lifecycle/analyze/unanalyzed — Compter les conversations non-analysées */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: { unanalyzed: 0, needs_reanalysis: 0 } })
  }

  const sessionIds = sessions.map((s) => s.id)

  // Conversations sans stage (jamais analysées)
  const { count: unanalyzed } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .in('session_id', sessionIds)
    .is('lifecycle_stage_id', null)

  // Conversations avec messages depuis la dernière analyse (> 0)
  const { count: needsReanalysis } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .in('session_id', sessionIds)
    .not('lifecycle_stage_id', 'is', null)
    .gt('lifecycle_messages_since_analysis', 0)

  return NextResponse.json({
    data: {
      unanalyzed: unanalyzed || 0,
      needs_reanalysis: needsReanalysis || 0,
      total: (unanalyzed || 0) + (needsReanalysis || 0),
    },
  })
}

/** POST /api/lifecycle/analyze/unanalyzed — Analyser toutes les conversations non-analysées */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Gating : l'analyse IA est réservée aux plans Pro/Scale
  if (!(await canUseAiAnalysis(supabase, user.id))) {
    return NextResponse.json({ error: 'L\'analyse IA est disponible à partir du plan Pro.' }, { status: 403 })
  }

  // Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: [], total_analyzed: 0, total_tokens: 0 })
  }

  const sessionIds = sessions.map((s) => s.id)

  // Récupérer les conversations non-analysées ou nécessitant une ré-analyse
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .in('session_id', sessionIds)
    .or('lifecycle_stage_id.is.null,lifecycle_messages_since_analysis.gt.0')
    .limit(50)

  if (!convs || convs.length === 0) {
    return NextResponse.json({ data: [], total_analyzed: 0, total_tokens: 0 })
  }

  const results = await analyzeMultipleConversations(
    convs.map((c) => c.id),
    user.id
  )

  const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0)

  return NextResponse.json({
    data: results,
    total_analyzed: results.length,
    total_tokens: totalTokens,
  })
}
