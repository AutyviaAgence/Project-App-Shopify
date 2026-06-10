import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CampaignStatus } from '@/types/database'

const VALID_STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']

/** GET /api/campaigns — Lister les campagnes de l'utilisateur */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')

  // Construire la requête
  let query = supabase
    .from('campaigns')
    .select('*, relance_agent:ai_agents!relance_agent_id(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Filtrer par statut si spécifié
  if (statusParam && VALID_STATUSES.includes(statusParam as CampaignStatus)) {
    query = query.eq('status', statusParam as CampaignStatus)
  }

  const { data: campaigns, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: campaigns || [] })
}

/** POST /api/campaigns — Créer une nouvelle campagne */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const {
    name,
    relance_agent_id,
    conversation_agent_id,
    message_template,
    filter_session_ids,
    filter_tracking_sources,
    filter_link_ids,
    filter_tag_ids,
    filter_lifecycle_stage_ids,
    filter_inactivity_days,
    filter_exclude_replied,
    max_recipients,
    delay_between_min,
    delay_between_max,
    messages_per_hour,
    send_hour_start,
    send_hour_end,
    min_response_rate,
    min_days_since_last_campaign,
    scheduled_at,
    template_id,
    campaign_mode,
    trigger_type,
    trigger_event,
    is_active,
  } = body as {
    name: string
    relance_agent_id?: string
    conversation_agent_id?: string
    message_template?: string
    template_id?: string
    campaign_mode?: 'manual' | 'auto'
    trigger_type?: string
    trigger_event?: string
    is_active?: boolean
    filter_session_ids?: string[]
    filter_tracking_sources?: string[]
    filter_link_ids?: string[]
    filter_tag_ids?: string[]
    filter_lifecycle_stage_ids?: string[]
    filter_inactivity_days?: number
    filter_exclude_replied?: boolean
    max_recipients?: number
    delay_between_min?: number
    delay_between_max?: number
    messages_per_hour?: number
    send_hour_start?: number
    send_hour_end?: number
    min_response_rate?: number
    min_days_since_last_campaign?: number
    scheduled_at?: string
  }

  // Validation
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })
  }

  // Nouvelle logique : un template Meta approuvé est requis (les campagnes
  // n'utilisent plus l'agent IA). On garde la compat si un template_id est fourni.
  if (!template_id && !message_template && !relance_agent_id) {
    return NextResponse.json(
      { error: 'Un modèle WhatsApp approuvé est requis' },
      { status: 400 }
    )
  }

  // Vérifier que l'agent est bien de type 'relance' si spécifié
  if (relance_agent_id) {
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id, agent_type')
      .eq('id', relance_agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 })
    }

    if (agent.agent_type !== 'relance') {
      return NextResponse.json(
        { error: 'L\'agent doit être de type "relance"' },
        { status: 400 }
      )
    }
  }

  // Créer la campagne
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      name: name.trim(),
      status: scheduled_at ? 'scheduled' : 'draft',
      relance_agent_id: relance_agent_id || null,
      conversation_agent_id: conversation_agent_id || null,
      message_template: message_template?.trim() || null,
      template_id: template_id || null,
      campaign_mode: campaign_mode || 'manual',
      trigger_type: trigger_type || null,
      trigger_event: trigger_event || null,
      is_active: is_active ?? false,
      filter_session_ids: filter_session_ids || null,
      filter_tracking_sources: filter_tracking_sources || null,
      filter_link_ids: filter_link_ids || null,
      filter_tag_ids: filter_tag_ids || null,
      filter_lifecycle_stage_ids: filter_lifecycle_stage_ids || null,
      filter_inactivity_days: filter_inactivity_days || null,
      filter_exclude_replied: filter_exclude_replied ?? false,
      max_recipients: max_recipients ?? 50,
      delay_between_min: delay_between_min ?? 30,
      delay_between_max: delay_between_max ?? 120,
      messages_per_hour: messages_per_hour ?? 20,
      send_hour_start: send_hour_start ?? 9,
      send_hour_end: send_hour_end ?? 21,
      min_response_rate: min_response_rate ?? 0.10,
      min_days_since_last_campaign: min_days_since_last_campaign ?? 7,
      scheduled_at: scheduled_at || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: campaign }, { status: 201 })
}
