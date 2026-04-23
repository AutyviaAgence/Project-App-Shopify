import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, getUserTeamPermissions, buildAccessFilter, filterAgentsByPermissions } from '@/lib/teams/access'
import { checkPlanQuota } from '@/lib/plan-quota'
import type { AIAgent } from '@/types/database'

const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o']

/** GET /api/agents — Lister les agents IA de l'utilisateur (+ équipes avec permissions) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les équipes et permissions de l'utilisateur
  const [teamIds, permissions] = await Promise.all([
    getUserTeamIds(supabase, user.id),
    getUserTeamPermissions(supabase, user.id)
  ])

  const { data: allAgents, error } = await supabase
    .from('ai_agents')
    .select('*')
    .or(buildAccessFilter(user.id, teamIds))
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filtrer selon les permissions granulaires
  const agents = filterAgentsByPermissions(
    (allAgents || []) as (AIAgent & { id: string; user_id: string; team_id: string | null })[],
    user.id,
    permissions
  )

  // Récupérer les team_ids pour chaque agent
  const agentIds = agents.map(a => a.id)
  let agentTeamsMap: Record<string, string[]> = {}

  if (agentIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: agentTeams } = await (supabase as any)
      .from('agent_teams')
      .select('agent_id, team_id')
      .in('agent_id', agentIds) as { data: { agent_id: string; team_id: string }[] | null }

    if (agentTeams) {
      for (const at of agentTeams) {
        if (!agentTeamsMap[at.agent_id]) {
          agentTeamsMap[at.agent_id] = []
        }
        agentTeamsMap[at.agent_id].push(at.team_id)
      }
    }
  }

  // Récupérer les stats de booking (propositions et clics) pour chaque agent
  const bookingStatsMap: Record<string, {
    total_proposals: number
    total_clicks: number
    unique_contacts: number
    conversion_rate: number
  }> = {}

  if (agentIds.length > 0) {
    // Récupérer les propositions et clics en parallèle
    const [
      { data: bookingProposals },
      { data: bookingClicks },
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('booking_proposals')
        .select('agent_id, clicked')
        .in('agent_id', agentIds) as Promise<{ data: { agent_id: string; clicked: boolean }[] | null }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('booking_link_clicks')
        .select('agent_id, contact_id')
        .in('agent_id', agentIds) as Promise<{ data: { agent_id: string; contact_id: string | null }[] | null }>,
    ])

    // Compter les propositions par agent
    if (bookingProposals) {
      for (const proposal of bookingProposals) {
        if (!bookingStatsMap[proposal.agent_id]) {
          bookingStatsMap[proposal.agent_id] = {
            total_proposals: 0,
            total_clicks: 0,
            unique_contacts: 0,
            conversion_rate: 0,
          }
        }
        bookingStatsMap[proposal.agent_id].total_proposals++
      }
    }

    // Compter les clics et contacts uniques par agent
    if (bookingClicks) {
      const contactsByAgent: Record<string, Set<string>> = {}
      for (const click of bookingClicks) {
        if (!bookingStatsMap[click.agent_id]) {
          bookingStatsMap[click.agent_id] = {
            total_proposals: 0,
            total_clicks: 0,
            unique_contacts: 0,
            conversion_rate: 0,
          }
        }
        bookingStatsMap[click.agent_id].total_clicks++

        if (click.contact_id) {
          if (!contactsByAgent[click.agent_id]) {
            contactsByAgent[click.agent_id] = new Set()
          }
          contactsByAgent[click.agent_id].add(click.contact_id)
        }
      }
      // Calculer les contacts uniques
      for (const [agentId, contacts] of Object.entries(contactsByAgent)) {
        if (bookingStatsMap[agentId]) {
          bookingStatsMap[agentId].unique_contacts = contacts.size
        }
      }
    }

    // Calculer le taux de conversion
    for (const agentId of Object.keys(bookingStatsMap)) {
      const stats = bookingStatsMap[agentId]
      if (stats.total_proposals > 0) {
        stats.conversion_rate = Math.round((stats.total_clicks / stats.total_proposals) * 100)
      }
    }
  }

  // Ajouter team_ids et booking_stats à chaque agent
  const agentsWithTeams = agents.map(a => ({
    ...a,
    team_ids: agentTeamsMap[a.id] || (a.team_id ? [a.team_id] : []),
    booking_stats: bookingStatsMap[a.id] || {
      total_proposals: 0,
      total_clicks: 0,
      unique_contacts: 0,
      conversion_rate: 0,
    },
  }))

  return NextResponse.json({ data: agentsWithTeams })
}

/** POST /api/agents — Créer un nouvel agent IA */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, description, system_prompt, objective, model, temperature, is_active, response_delay_min, response_delay_max, max_messages_per_conversation, inactivity_timeout_minutes, escalation_enabled, escalation_keywords, escalation_message, booking_url, team_id, team_ids, agent_type, stop_condition } = body as {
    name?: string
    description?: string
    system_prompt?: string
    objective?: string
    model?: string
    temperature?: number
    is_active?: boolean
    response_delay_min?: number
    response_delay_max?: number
    max_messages_per_conversation?: number | null
    inactivity_timeout_minutes?: number | null
    escalation_enabled?: boolean
    escalation_keywords?: string[]
    escalation_message?: string
    booking_url?: string
    team_id?: string
    team_ids?: string[]
    agent_type?: 'conversation' | 'relance' | 'qualifier'
    stop_condition?: string
  }

  // Vérifier le quota d'agents selon le plan
  const agentQuota = await checkPlanQuota(supabase, user.id, 'agents')
  if (!agentQuota.allowed) {
    return NextResponse.json({
      error: `Limite atteinte : votre plan ${agentQuota.plan} inclut ${agentQuota.limit} agent(s) IA. Passez à un plan supérieur pour en ajouter davantage.`,
      quota_exceeded: true,
      limit: agentQuota.limit,
      current: agentQuota.current,
    }, { status: 403 })
  }

  // Support des deux formats: team_id (legacy) et team_ids (nouveau)
  const selectedTeamIds = team_ids || (team_id ? [team_id] : [])

  // Vérifier que l'utilisateur a accès aux équipes spécifiées
  if (selectedTeamIds.length > 0) {
    const userTeamIds = await getUserTeamIds(supabase, user.id)
    const unauthorized = selectedTeamIds.filter(id => !userTeamIds.includes(id))
    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Équipe(s) non autorisée(s)' }, { status: 403 })
    }
  }

  if (!name?.trim() || !system_prompt?.trim()) {
    return NextResponse.json({ error: 'Nom et prompt système requis' }, { status: 400 })
  }

  const finalModel = VALID_MODELS.includes(model || '') ? model! : 'gpt-4o-mini'
  const finalTemp = typeof temperature === 'number'
    ? Math.max(0, Math.min(2, temperature))
    : 0.7
  const finalDelayMin = typeof response_delay_min === 'number'
    ? Math.max(0, Math.min(30, Math.floor(response_delay_min)))
    : 0
  const finalDelayMax = typeof response_delay_max === 'number'
    ? Math.max(finalDelayMin, Math.min(30, Math.floor(response_delay_max)))
    : finalDelayMin

  const finalMaxMessages = max_messages_per_conversation != null
    ? Math.max(1, Math.min(10000, Math.floor(max_messages_per_conversation)))
    : null
  const finalInactivityTimeout = inactivity_timeout_minutes != null
    ? Math.max(1, Math.min(10080, Math.floor(inactivity_timeout_minutes)))
    : null

  // Escalation settings
  const finalEscalationKeywords = Array.isArray(escalation_keywords)
    ? escalation_keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
    : undefined

  // Valider le type d'agent
  const validAgentTypes = ['conversation', 'relance', 'qualifier'] as const
  const finalAgentType = agent_type && validAgentTypes.includes(agent_type) ? agent_type : 'conversation'

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .insert({
      user_id: user.id,
      team_id: selectedTeamIds[0] || null, // Legacy: garder le premier pour compatibilité
      name: name.trim(),
      description: description?.trim() || null,
      system_prompt: system_prompt.trim(),
      objective: objective?.trim() || null,
      model: finalModel,
      temperature: finalTemp,
      response_delay_min: finalDelayMin,
      response_delay_max: finalDelayMax,
      is_active: is_active !== undefined ? is_active : true,
      max_messages_per_conversation: finalMaxMessages,
      inactivity_timeout_minutes: finalInactivityTimeout,
      escalation_enabled: escalation_enabled ?? false,
      escalation_keywords: finalEscalationKeywords,
      escalation_message: escalation_message?.trim() || null,
      booking_url: booking_url?.trim() || null,
      agent_type: finalAgentType,
      stop_condition: stop_condition?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Créer les associations multi-équipes
  if (selectedTeamIds.length > 0 && agent) {
    const teamAssociations = selectedTeamIds.map(teamId => ({
      agent_id: agent.id,
      team_id: teamId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('agent_teams').insert(teamAssociations)
  }

  return NextResponse.json({
    data: { ...agent, team_ids: selectedTeamIds }
  })
}
