import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeMultipleConversations } from '@/lib/openai/lifecycle-analyzer'
import { canUseAiAnalysis } from '@/lib/subscription/plan'

/** POST /api/lifecycle/analyze — Analyser une ou plusieurs conversations */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Gating : l'analyse IA est réservée aux plans Pro/Scale
  if (!(await canUseAiAnalysis(supabase, user.id))) {
    return NextResponse.json({ error: 'L\'analyse IA est disponible à partir du plan Pro.' }, { status: 403 })
  }

  const body = await req.json()
  const { conversation_ids } = body as { conversation_ids?: string[] }

  if (!Array.isArray(conversation_ids) || conversation_ids.length === 0) {
    return NextResponse.json({ error: 'conversation_ids[] requis' }, { status: 400 })
  }

  // Vérifier que les conversations appartiennent à l'utilisateur (WhatsApp ou email)
  const [{ data: waSessions }, { data: emailSessions }] = await Promise.all([
    supabase.from('whatsapp_sessions').select('id').eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('email_sessions').select('id').eq('user_id', user.id),
  ])

  const waSessionIds = (waSessions || []).map((s: { id: string }) => s.id)
  const emailSessionIds = (emailSessions || []).map((s: { id: string }) => s.id)

  // Conversations WhatsApp (session_id dans les sessions WA)
  const { data: waConvs } = waSessionIds.length > 0
    ? await supabase.from('conversations').select('id').in('id', conversation_ids).in('session_id', waSessionIds)
    : { data: [] }

  // Conversations email (email_session_id dans les sessions email)
  const { data: emailConvs } = emailSessionIds.length > 0
    ? await supabase.from('conversations').select('id').in('id', conversation_ids).in('email_session_id', emailSessionIds)
    : { data: [] }

  const validIds = [...(waConvs || []), ...(emailConvs || [])].map((c: { id: string }) => c.id)

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
