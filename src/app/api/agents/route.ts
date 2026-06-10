import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPlanQuota } from '@/lib/plan-quota'

const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o']

/** GET /api/agents — Lister les agents IA de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: allAgents, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const agents = allAgents || []
  const agentIds = agents.map(a => a.id)

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

  // Ajouter booking_stats à chaque agent
  const agentsWithStats = agents.map(a => ({
    ...a,
    booking_stats: bookingStatsMap[a.id] || {
      total_proposals: 0,
      total_clicks: 0,
      unique_contacts: 0,
      conversion_rate: 0,
    },
  }))

  return NextResponse.json({ data: agentsWithStats })
}

/** POST /api/agents — Créer un nouvel agent IA */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, description, system_prompt, objective, model, temperature, is_active, response_delay_min, response_delay_max, max_messages_per_conversation, inactivity_timeout_minutes, escalation_enabled, escalation_keywords, escalation_message, booking_url, stop_condition } = body as {
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
    stop_condition?: string
  }

  // Vérifier le quota d'agents selon le plan
  const agentQuota = await checkPlanQuota(supabase, user.id, 'agents')
  if (!agentQuota.allowed) {
    const error = agentQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des agents IA.'
      : agentQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer un agent IA. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${agentQuota.plan} inclut ${agentQuota.limit} agent(s) IA. Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: agentQuota.reason,
      limit: agentQuota.limit,
      current: agentQuota.current,
    }, { status: 403 })
  }

  if (!name?.trim() || !system_prompt?.trim()) {
    return NextResponse.json({ error: 'Nom et prompt système requis' }, { status: 400 })
  }

  const finalModel = VALID_MODELS.includes(model || '') ? model! : 'gpt-4o'
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

  // Type d'agent retiré : tous les agents sont uniformes ('conversation')
  const finalAgentType = 'conversation'

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .insert({
      user_id: user.id,
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

  return NextResponse.json({ data: agent })
}
