import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds } from '@/lib/teams/access'

type BookingClick = {
  id: string
  conversation_id: string | null
  contact_id: string | null
  clicked_at: string
}

/** GET /api/agents/[id]/stats — Statistiques de l'agent (clics RDV, etc.) */
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

  // Vérifier l'accès à l'agent
  const teamIds = await getUserTeamIds(supabase, user.id)
  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select('id, user_id, team_id, booking_url')
    .eq('id', id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 })
  }

  // Vérifier que l'utilisateur a accès
  const hasAccess = agent.user_id === user.id ||
    (agent.team_id && teamIds.includes(agent.team_id))

  if (!hasAccess) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

  // Récupérer les stats de clics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clicks, error: clicksError } = await (supabase as any)
    .from('booking_link_clicks')
    .select('id, conversation_id, contact_id, clicked_at')
    .eq('agent_id', id)
    .order('clicked_at', { ascending: false }) as { data: BookingClick[] | null; error: Error | null }

  if (clicksError) {
    return NextResponse.json({ error: clicksError.message }, { status: 500 })
  }

  // Calculer les statistiques
  const totalClicks = clicks?.length || 0
  const uniqueConversations = new Set(clicks?.map(c => c.conversation_id).filter(Boolean)).size
  const uniqueContacts = new Set(clicks?.map(c => c.contact_id).filter(Boolean)).size

  // Clics par jour (7 derniers jours)
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const clicksByDay: Record<string, number> = {}
  for (let i = 0; i < 7; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const dateStr = date.toISOString().split('T')[0]
    clicksByDay[dateStr] = 0
  }

  clicks?.forEach(click => {
    const clickDate = new Date(click.clicked_at)
    if (clickDate >= sevenDaysAgo) {
      const dateStr = clickDate.toISOString().split('T')[0]
      if (clicksByDay[dateStr] !== undefined) {
        clicksByDay[dateStr]++
      }
    }
  })

  // Clics des 30 derniers jours
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const clicksLast30Days = clicks?.filter(c => new Date(c.clicked_at) >= thirtyDaysAgo).length || 0

  // Derniers clics (10 derniers)
  const recentClicks = clicks?.slice(0, 10).map(c => ({
    id: c.id,
    clicked_at: c.clicked_at,
    has_conversation: !!c.conversation_id,
    has_contact: !!c.contact_id,
  })) || []

  return NextResponse.json({
    data: {
      total_clicks: totalClicks,
      unique_conversations: uniqueConversations,
      unique_contacts: uniqueContacts,
      clicks_last_30_days: clicksLast30Days,
      clicks_by_day: clicksByDay,
      recent_clicks: recentClicks,
      has_booking_url: !!agent.booking_url,
    }
  })
}
