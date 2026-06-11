import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/campaigns/[id]/eligible-contacts
 * Récupère les contacts éligibles avec filtres avancés
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les paramètres de recherche
  const searchParams = req.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '50') || 50, 100))
  const offset = (page - 1) * limit

  // Récupérer la campagne
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier l'accès (propriétaire uniquement)
  if (campaign.user_id !== user.id) {
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
      p_max_recipients: 1000, // On récupère plus pour la sélection manuelle
    }
  )

  if (error) {
    console.error('Erreur eligible-contacts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let contacts = eligibleContacts || []

  // Filtrer par lifecycle stage si spécifié
  if (campaign.filter_lifecycle_stage_ids && campaign.filter_lifecycle_stage_ids.length > 0) {
    const stageIds = (campaign.filter_lifecycle_stage_ids as string[]).filter(id => uuidRegex.test(id))
    const conversationIds = contacts
      .map((c: { conversation_id: string | null }) => c.conversation_id)
      .filter(Boolean) as string[]

    if (conversationIds.length > 0 && stageIds.length > 0) {
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

  // Appliquer le filtre de recherche côté serveur
  if (search) {
    const searchLower = search.toLowerCase()
    contacts = contacts.filter((c: { contact_name: string | null; phone_number: string }) =>
      (c.contact_name && c.contact_name.toLowerCase().includes(searchLower)) ||
      c.phone_number.includes(searchLower)
    )
  }

  // Récupérer les contacts déjà ajoutés à cette campagne
  const { data: existingRecipients } = await supabase
    .from('campaign_recipients')
    .select('contact_id')
    .eq('campaign_id', id)

  const existingContactIds = new Set(existingRecipients?.map(r => r.contact_id) || [])

  // Ajouter le flag isSelected pour les contacts déjà dans la campagne
  const contactsWithSelection = contacts.map((c: { contact_id: string; contact_name: string | null; phone_number: string; session_id: string; conversation_id: string | null; last_message_at: string | null }) => ({
    ...c,
    isSelected: existingContactIds.has(c.contact_id),
  }))

  // Pagination
  const totalCount = contactsWithSelection.length
  const paginatedContacts = contactsWithSelection.slice(offset, offset + limit)

  return NextResponse.json({
    data: {
      contacts: paginatedContacts,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  })
}

/**
 * POST /api/campaigns/[id]/eligible-contacts
 * Ajoute des contacts sélectionnés à la campagne
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { contact_ids, action } = body as {
    contact_ids: string[]
    action: 'add' | 'remove' | 'replace'
  }

  if (!contact_ids || !Array.isArray(contact_ids)) {
    return NextResponse.json({ error: 'contact_ids requis' }, { status: 400 })
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
      { error: 'La campagne doit être en brouillon pour modifier les destinataires' },
      { status: 400 }
    )
  }

  if (action === 'replace') {
    // Supprimer tous les anciens destinataires
    await supabase
      .from('campaign_recipients')
      .delete()
      .eq('campaign_id', id)
  } else if (action === 'remove') {
    // Supprimer uniquement les contacts spécifiés
    await supabase
      .from('campaign_recipients')
      .delete()
      .eq('campaign_id', id)
      .in('contact_id', contact_ids)

    // Mettre à jour le compteur
    const { count } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)

    await supabase
      .from('campaigns')
      .update({ total_recipients: count || 0 })
      .eq('id', id)

    return NextResponse.json({
      data: { removed_count: contact_ids.length },
    })
  }

  // Pour 'add' ou 'replace', on doit récupérer les infos des contacts
  const { data: eligibleContacts } = await supabase.rpc(
    'get_campaign_eligible_contacts',
    {
      p_user_id: user.id,
      p_session_ids: campaign.filter_session_ids,
      p_tracking_sources: campaign.filter_tracking_sources,
      p_tag_ids: campaign.filter_tag_ids,
      p_inactivity_days: campaign.filter_inactivity_days,
      p_exclude_replied: campaign.filter_exclude_replied,
      p_min_days_since_last_campaign: campaign.min_days_since_last_campaign,
      p_max_recipients: 1000,
    }
  )

  let eligibleFiltered = eligibleContacts || []

  // Filtrer par lifecycle stage si spécifié
  if (campaign.filter_lifecycle_stage_ids && campaign.filter_lifecycle_stage_ids.length > 0) {
    const stageIds = (campaign.filter_lifecycle_stage_ids as string[]).filter(id => uuidRegex.test(id))
    const conversationIds = eligibleFiltered
      .map((c: { conversation_id: string | null }) => c.conversation_id)
      .filter(Boolean) as string[]

    if (conversationIds.length > 0 && stageIds.length > 0) {
      const { data: convStages } = await supabase
        .from('conversations')
        .select('id, lifecycle_stage_id')
        .in('id', conversationIds)
        .in('lifecycle_stage_id', stageIds)

      const validConvIds = new Set((convStages || []).map(c => c.id))
      eligibleFiltered = eligibleFiltered.filter((c: { conversation_id: string | null }) =>
        c.conversation_id && validConvIds.has(c.conversation_id)
      )
    } else {
      eligibleFiltered = []
    }
  }

  // Filtrer pour ne garder que les contacts sélectionnés
  const selectedContacts = eligibleFiltered.filter(
    (c: { contact_id: string }) => contact_ids.includes(c.contact_id)
  )

  if (selectedContacts.length === 0) {
    return NextResponse.json(
      { error: 'Aucun contact valide sélectionné' },
      { status: 400 }
    )
  }

  // Vérifier les contacts déjà existants pour éviter les doublons
  const { data: existingRecipients } = await supabase
    .from('campaign_recipients')
    .select('contact_id')
    .eq('campaign_id', id)

  const existingContactIds = new Set(existingRecipients?.map(r => r.contact_id) || [])

  // Filtrer les nouveaux contacts
  const newContacts = selectedContacts.filter(
    (c: { contact_id: string }) => !existingContactIds.has(c.contact_id)
  )

  if (newContacts.length === 0 && action === 'add') {
    return NextResponse.json(
      { error: 'Tous les contacts sont déjà dans la campagne' },
      { status: 400 }
    )
  }

  // Insérer les nouveaux destinataires
  if (newContacts.length > 0) {
    const recipients = newContacts.map((contact: {
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
  }

  // Mettre à jour le compteur total
  const { count } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)

  await supabase
    .from('campaigns')
    .update({ total_recipients: count || 0 })
    .eq('id', id)

  return NextResponse.json({
    data: {
      added_count: newContacts.length,
      total_recipients: count || 0,
    },
  })
}
