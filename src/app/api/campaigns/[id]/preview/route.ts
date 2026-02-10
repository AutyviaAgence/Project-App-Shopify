import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds } from '@/lib/teams/access'

/** GET /api/campaigns/[id]/preview — Prévisualiser les contacts éligibles */
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

  // Récupérer la campagne
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
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

  // Appeler la fonction SQL pour obtenir les contacts éligibles
  const { data: eligibleContacts, error } = await supabase.rpc(
    'get_campaign_eligible_contacts',
    {
      p_user_id: user.id,
      p_session_ids: campaign.filter_session_ids,
      p_tracking_sources: campaign.filter_tracking_sources,
      p_tag_ids: campaign.filter_tag_ids,
      p_inactivity_days: campaign.filter_inactivity_days,
      p_exclude_replied: campaign.filter_exclude_replied,
      p_min_days_since_last_campaign: campaign.min_days_since_last_campaign,
      p_max_recipients: campaign.max_recipients,
    }
  )

  if (error) {
    console.error('Erreur preview:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let contacts = eligibleContacts || []

  // Filtrer par lifecycle stage si spécifié
  if (campaign.filter_lifecycle_stage_ids && campaign.filter_lifecycle_stage_ids.length > 0) {
    const stageIds = campaign.filter_lifecycle_stage_ids as string[]
    // Récupérer les conversation_ids avec leur lifecycle_stage_id
    const conversationIds = contacts
      .map((c: { conversation_id: string | null }) => c.conversation_id)
      .filter(Boolean) as string[]

    if (conversationIds.length > 0) {
      const { data: convStages } = await supabase
        .from('conversations')
        .select('id, lifecycle_stage_id')
        .in('id', conversationIds)
        .in('lifecycle_stage_id', stageIds)

      const validConvIds = new Set((convStages || []).map(c => c.id))
      contacts = contacts.filter((c: { conversation_id: string | null }) =>
        c.conversation_id && validConvIds.has(c.conversation_id)
      )
    } else {
      contacts = []
    }
  }

  return NextResponse.json({
    data: {
      eligible_count: contacts.length,
      max_recipients: campaign.max_recipients,
      contacts,
    },
  })
}

/** POST /api/campaigns/[id]/preview — Ajouter les contacts éligibles comme destinataires */
export async function POST(
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
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier que l'utilisateur est le propriétaire
  if (campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier que la campagne est en brouillon
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return NextResponse.json(
      { error: 'La campagne doit être en brouillon pour ajouter des destinataires' },
      { status: 400 }
    )
  }

  // Supprimer les anciens destinataires
  await supabase
    .from('campaign_recipients')
    .delete()
    .eq('campaign_id', id)

  // Appeler la fonction SQL pour obtenir les contacts éligibles
  const { data: eligibleContacts, error: eligibleError } = await supabase.rpc(
    'get_campaign_eligible_contacts',
    {
      p_user_id: user.id,
      p_session_ids: campaign.filter_session_ids,
      p_tracking_sources: campaign.filter_tracking_sources,
      p_tag_ids: campaign.filter_tag_ids,
      p_inactivity_days: campaign.filter_inactivity_days,
      p_exclude_replied: campaign.filter_exclude_replied,
      p_min_days_since_last_campaign: campaign.min_days_since_last_campaign,
      p_max_recipients: campaign.max_recipients,
    }
  )

  if (eligibleError) {
    return NextResponse.json({ error: eligibleError.message }, { status: 500 })
  }

  let filteredContacts = eligibleContacts || []

  // Filtrer par lifecycle stage si spécifié
  if (campaign.filter_lifecycle_stage_ids && campaign.filter_lifecycle_stage_ids.length > 0) {
    const stageIds = campaign.filter_lifecycle_stage_ids as string[]
    const conversationIds = filteredContacts
      .map((c: { conversation_id: string | null }) => c.conversation_id)
      .filter(Boolean) as string[]

    if (conversationIds.length > 0) {
      const { data: convStages } = await supabase
        .from('conversations')
        .select('id, lifecycle_stage_id')
        .in('id', conversationIds)
        .in('lifecycle_stage_id', stageIds)

      const validConvIds = new Set((convStages || []).map(c => c.id))
      filteredContacts = filteredContacts.filter((c: { conversation_id: string | null }) =>
        c.conversation_id && validConvIds.has(c.conversation_id)
      )
    } else {
      filteredContacts = []
    }
  }

  if (!filteredContacts || filteredContacts.length === 0) {
    return NextResponse.json(
      { error: 'Aucun contact éligible trouvé' },
      { status: 400 }
    )
  }

  // Insérer les destinataires
  const recipients = filteredContacts.map((contact: {
    contact_id: string
    conversation_id: string | null
    session_id: string
  }) => ({
    campaign_id: id,
    contact_id: contact.contact_id,
    conversation_id: contact.conversation_id,
    session_id: contact.session_id,
    status: 'pending' as const,
  }))

  const { error: insertError } = await supabase
    .from('campaign_recipients')
    .insert(recipients)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Mettre à jour le compteur total
  await supabase
    .from('campaigns')
    .update({ total_recipients: recipients.length })
    .eq('id', id)

  return NextResponse.json({
    data: {
      added_count: recipients.length,
    },
  })
}
