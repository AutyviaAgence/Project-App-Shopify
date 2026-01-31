import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds } from '@/lib/teams/access'

/** GET /api/campaigns/[id] — Récupérer une campagne */
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

  // Récupérer la campagne avec l'agent de relance
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*, relance_agent:ai_agents!relance_agent_id(id, name, system_prompt)')
    .eq('id', id)
    .single()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier l'accès
  const teamIds = await getUserTeamIds(supabase, user.id)
  const hasAccess =
    campaign.user_id === user.id ||
    (campaign.team_id && teamIds.includes(campaign.team_id))

  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer les destinataires
  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('*, contact:contacts(id, name, phone_number)')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    data: {
      ...campaign,
      recipients: recipients || [],
    },
  })
}

/** PATCH /api/campaigns/[id] — Modifier une campagne (brouillon uniquement) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer la campagne existante
  const { data: existing, error: fetchError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier que l'utilisateur est le propriétaire
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier que la campagne est en brouillon ou programmée
  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    return NextResponse.json(
      { error: 'Seules les campagnes en brouillon ou programmées peuvent être modifiées' },
      { status: 400 }
    )
  }

  const body = await req.json()
  const updateData: Record<string, unknown> = {}

  // Champs modifiables
  const fields = [
    'name',
    'team_id',
    'relance_agent_id',
    'message_template',
    'filter_session_ids',
    'filter_tracking_sources',
    'filter_tag_ids',
    'filter_inactivity_days',
    'filter_exclude_replied',
    'max_recipients',
    'delay_between_min',
    'delay_between_max',
    'messages_per_hour',
    'send_hour_start',
    'send_hour_end',
    'min_response_rate',
    'min_days_since_last_campaign',
    'scheduled_at',
  ]

  for (const field of fields) {
    if (field in body) {
      updateData[field] = body[field]
    }
  }

  // Vérifier que l'agent est bien de type 'relance' si modifié
  if (updateData.relance_agent_id && typeof updateData.relance_agent_id === 'string') {
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('agent_type')
      .eq('id', updateData.relance_agent_id)
      .single()

    if (!agent || agent.agent_type !== 'relance') {
      return NextResponse.json(
        { error: 'L\'agent doit être de type "relance"' },
        { status: 400 }
      )
    }
  }

  // Mettre à jour le statut si scheduled_at change
  if ('scheduled_at' in updateData) {
    if (updateData.scheduled_at) {
      updateData.status = 'scheduled'
    } else if (existing.status === 'scheduled') {
      updateData.status = 'draft'
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: campaign })
}

/** DELETE /api/campaigns/[id] — Supprimer une campagne */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer la campagne
  const { data: existing, error: fetchError } = await supabase
    .from('campaigns')
    .select('user_id, status')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier que l'utilisateur est le propriétaire
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Empêcher la suppression si en cours
  if (existing.status === 'running') {
    return NextResponse.json(
      { error: 'Impossible de supprimer une campagne en cours. Mettez-la en pause d\'abord.' },
      { status: 400 }
    )
  }

  // Supprimer la campagne (les recipients seront supprimés en cascade)
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
