import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/lifecycle/stats — Statistiques détaillées du lifecycle */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // 1. Récupérer les stages de l'utilisateur
  const { data: stages } = await supabase
    .from('lifecycle_stages')
    .select('id, name, color, icon, position')
    .eq('user_id', user.id)
    .order('position')

  if (!stages || stages.length === 0) {
    return NextResponse.json({
      data: {
        stages: [],
        total_conversations: 0,
        classified: 0,
        unclassified: 0,
        distribution: [],
        recent_transitions: [],
        tokens_used_total: 0,
        ai_analyses_count: 0,
      },
    })
  }

  // 2. Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (sessions || []).map(s => s.id)

  if (sessionIds.length === 0) {
    return NextResponse.json({
      data: {
        stages: stages,
        total_conversations: 0,
        classified: 0,
        unclassified: 0,
        distribution: [],
        recent_transitions: [],
        tokens_used_total: 0,
        ai_analyses_count: 0,
      },
    })
  }

  // 3. Récupérer toutes les conversations avec leur stage
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, lifecycle_stage_id, lifecycle_last_analyzed_at, updated_at')
    .in('session_id', sessionIds)

  const allConvs = conversations || []
  const total = allConvs.length
  const classified = allConvs.filter(c => c.lifecycle_stage_id).length
  const unclassified = total - classified

  // 4. Distribution par stage
  const countByStage: Record<string, number> = {}
  for (const conv of allConvs) {
    const key = conv.lifecycle_stage_id || 'none'
    countByStage[key] = (countByStage[key] || 0) + 1
  }

  const distribution = stages.map(stage => ({
    stage_id: stage.id,
    stage_name: stage.name,
    stage_color: stage.color,
    stage_icon: stage.icon,
    count: countByStage[stage.id] || 0,
    percentage: total > 0 ? Math.round(((countByStage[stage.id] || 0) / total) * 100) : 0,
  }))

  // Ajouter "Non classifié"
  distribution.push({
    stage_id: 'none',
    stage_name: 'Non classifié',
    stage_color: '#6B7280',
    stage_icon: null,
    count: countByStage['none'] || 0,
    percentage: total > 0 ? Math.round(((countByStage['none'] || 0) / total) * 100) : 0,
  })

  // 5. Récupérer les 10 dernières transitions
  const convIds = allConvs.map(c => c.id)
  const { data: recentTransitions } = await supabase
    .from('lifecycle_history')
    .select('id, conversation_id, from_stage_id, to_stage_id, reason, changed_by, tokens_used, created_at')
    .in('conversation_id', convIds.length > 0 ? convIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })
    .limit(10)

  // Enrichir les transitions avec les noms de stages
  const stageMap = new Map(stages.map(s => [s.id, s]))
  const enrichedTransitions = (recentTransitions || []).map(t => ({
    ...t,
    from_stage_name: t.from_stage_id ? stageMap.get(t.from_stage_id)?.name || null : null,
    from_stage_color: t.from_stage_id ? stageMap.get(t.from_stage_id)?.color || null : null,
    to_stage_name: t.to_stage_id ? stageMap.get(t.to_stage_id)?.name || null : null,
    to_stage_color: t.to_stage_id ? stageMap.get(t.to_stage_id)?.color || null : null,
  }))

  // 6. Stats globales sur l'historique (tokens + nombre d'analyses)
  const { data: historyStats } = await supabase
    .from('lifecycle_history')
    .select('tokens_used, changed_by')
    .in('conversation_id', convIds.length > 0 ? convIds : ['00000000-0000-0000-0000-000000000000'])

  const allHistory = historyStats || []
  const tokensTotal = allHistory.reduce((sum, h) => sum + (h.tokens_used || 0), 0)
  const aiAnalyses = allHistory.filter(h => h.changed_by === 'ai').length
  const manualChanges = allHistory.filter(h => h.changed_by === 'user').length

  return NextResponse.json({
    data: {
      stages,
      total_conversations: total,
      classified,
      unclassified,
      distribution,
      recent_transitions: enrichedTransitions,
      tokens_used_total: tokensTotal,
      ai_analyses_count: aiAnalyses,
      manual_changes_count: manualChanges,
    },
  })
}
