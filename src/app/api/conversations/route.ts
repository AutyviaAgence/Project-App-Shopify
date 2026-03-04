import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, getUserTeamPermissions, filterSessionsByPermissions } from '@/lib/teams/access'

/** GET /api/conversations — Lister les conversations de l'utilisateur */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Parse query params for filters and pagination
  const { searchParams } = new URL(req.url)
  const sessionFilter = searchParams.get('session_id')
  const aiActiveFilter = searchParams.get('is_ai_active')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const teamFilter = searchParams.get('team_id')
  const lifecycleStageFilter = searchParams.get('lifecycle_stage_id')
  const searchQuery = searchParams.get('search')?.trim().toLowerCase()
  const tagIdsParam = searchParams.get('tag_ids')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

  // Récupérer les équipes et permissions de l'utilisateur
  const teamIds = await getUserTeamIds(supabase, user.id)
  const permissions = await getUserTeamPermissions(supabase, user.id)

  // Récupérer les sessions de l'utilisateur et de ses équipes
  let sessionsQuery = supabase
    .from('whatsapp_sessions')
    .select('*')

  if (teamIds.length > 0) {
    sessionsQuery = sessionsQuery.or(`user_id.eq.${user.id},team_id.in.(${teamIds.join(',')})`)
  } else {
    sessionsQuery = sessionsQuery.eq('user_id', user.id)
  }

  // Filtrer par équipe si demandé
  if (teamFilter === 'personal') {
    sessionsQuery = supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', user.id)
      .is('team_id', null)
  } else if (teamFilter && teamFilter !== 'all') {
    // Vérifier que l'utilisateur a accès à cette équipe
    if (!teamIds.includes(teamFilter)) {
      return NextResponse.json({ data: [] })
    }
    sessionsQuery = supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('team_id', teamFilter)
  }

  const { data: allSessions } = await sessionsQuery

  if (!allSessions || allSessions.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Filtrer les sessions selon les permissions granulaires
  let sessions = filterSessionsByPermissions(allSessions, user.id, permissions)

  // Filtrer aussi les sessions où l'utilisateur n'a pas la permission can_view_messages
  sessions = sessions.filter((session) => {
    // Ressources personnelles = toujours accès
    if (session.user_id === user.id) return true

    // Pour les ressources d'équipe, vérifier can_view_messages
    if (session.team_id) {
      const memberPerm = permissions.find((p) => p.team_id === session.team_id)
      if (!memberPerm) return false

      // Owner/Admin ont toujours accès
      if (memberPerm.role === 'owner' || memberPerm.role === 'admin') return true

      // Vérifier la permission can_view_messages
      return memberPerm.can_view_messages === true
    }

    return false
  })

  if (sessions.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const sessionIds = sessions.map((s) => s.id)
  const sessionsMap = Object.fromEntries(sessions.map((s) => [s.id, s]))

  // --- Recherche côté DB : trouver les contact_ids matchants AVANT la query conversations ---
  let searchContactIds: string[] | null = null
  let searchConvPreviewIds: string[] | null = null
  if (searchQuery) {
    // Normaliser le numéro pour la recherche :
    // - Retirer +, espaces, tirets, parenthèses
    // - Convertir 0X... → 33X... (format français)
    const cleanedSearch = searchQuery.replace(/[\s+\-()]/g, '')
    const phoneSearch = cleanedSearch.startsWith('0') && cleanedSearch.length >= 2
      ? '33' + cleanedSearch.slice(1)
      : cleanedSearch

    // Chercher dans les contacts par phone (normalisé), name, first_name, last_name
    const phonePattern = `%${phoneSearch}%`
    const namePattern = `%${searchQuery}%`
    const { data: matchingContacts } = await supabase
      .from('contacts')
      .select('id')
      .in('session_id', sessionIds)
      .or(`phone_number.ilike.${phonePattern},name.ilike.${namePattern},first_name.ilike.${namePattern},last_name.ilike.${namePattern}`)

    searchContactIds = (matchingContacts || []).map((c) => c.id)

    // Chercher aussi dans last_message_preview des conversations
    const { data: matchingConvs } = await supabase
      .from('conversations')
      .select('id')
      .in('session_id', sessionIds)
      .ilike('last_message_preview', namePattern)

    searchConvPreviewIds = (matchingConvs || []).map((c) => c.id)
  }

  // --- Filtre par tags : trouver les conversation_ids matchants ---
  let tagConvIds: string[] | null = null
  if (tagIdsParam) {
    const tagIds = tagIdsParam.split(',').filter(Boolean)
    if (tagIds.length > 0) {
      const { data: tagAssignments } = await supabase
        .from('conversation_tag_assignments')
        .select('conversation_id')
        .in('tag_id', tagIds)

      tagConvIds = [...new Set((tagAssignments || []).map((a) => a.conversation_id))]
      if (tagConvIds.length === 0) {
        // Aucune conversation ne matche ces tags
        return NextResponse.json({
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        })
      }
    }
  }

  // Build query with filters (with count for pagination)
  let query = supabase
    .from('conversations')
    .select('*', { count: 'exact' })
    .in('session_id', sessionIds)

  // Filter by session
  if (sessionFilter && sessionIds.includes(sessionFilter)) {
    query = query.eq('session_id', sessionFilter)
  }

  // Filter by AI status
  if (aiActiveFilter === 'true') {
    query = query.eq('is_ai_active', true)
  } else if (aiActiveFilter === 'false') {
    query = query.eq('is_ai_active', false)
  }

  // Filter by lifecycle stage
  if (lifecycleStageFilter === 'none') {
    query = query.is('lifecycle_stage_id', null)
  } else if (lifecycleStageFilter && lifecycleStageFilter !== 'all') {
    query = query.eq('lifecycle_stage_id', lifecycleStageFilter)
  }

  // Filter by date range
  if (dateFrom) {
    query = query.gte('last_message_at', dateFrom)
  }
  if (dateTo) {
    query = query.lte('last_message_at', dateTo)
  }

  // Filter by search (DB-side) — conversations whose contact matches OR whose preview matches
  if (searchQuery && searchContactIds !== null && searchConvPreviewIds !== null) {
    const allMatchingIds = [...new Set([...searchContactIds, ...searchConvPreviewIds])]
    if (allMatchingIds.length === 0) {
      // Aucun résultat de recherche
      return NextResponse.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      })
    }
    // Combiner : contact_id dans les contacts matchants OU id dans les conversations avec preview matchant
    if (searchContactIds.length > 0 && searchConvPreviewIds.length > 0) {
      query = query.or(`contact_id.in.(${searchContactIds.join(',')}),id.in.(${searchConvPreviewIds.join(',')})`)
    } else if (searchContactIds.length > 0) {
      query = query.in('contact_id', searchContactIds)
    } else {
      query = query.in('id', searchConvPreviewIds)
    }
  }

  // Filter by tags
  if (tagConvIds !== null) {
    query = query.in('id', tagConvIds)
  }

  // Pagination: calculate offset
  const offset = (page - 1) * limit

  // Execute query with pagination
  const { data: conversations, error, count } = await query
    .order('is_pinned', { ascending: false })
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({
      data: [],
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    })
  }

  // Récupérer les contacts
  const contactIds = [...new Set(conversations.map((c) => c.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .in('id', contactIds)

  const contactsMap = Object.fromEntries((contacts || []).map((c) => [c.id, c]))

  // Récupérer les noms des équipes
  const sessionTeamIds = [...new Set(sessions.map((s) => s.team_id).filter(Boolean))] as string[]
  let teamsMap: Record<string, { id: string; name: string }> = {}
  if (sessionTeamIds.length > 0) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', sessionTeamIds)
    teamsMap = Object.fromEntries((teams || []).map((t) => [t.id, t]))
  }

  // Assembler les données
  const result = conversations.map((conv) => {
    const session = sessionsMap[conv.session_id]
    return {
      ...conv,
      contact: contactsMap[conv.contact_id] || null,
      session: {
        id: session?.id,
        instance_name: session?.instance_name,
        phone_number: session?.phone_number,
        team_id: session?.team_id || null,
        team_name: session?.team_id ? teamsMap[session.team_id]?.name : null,
      },
    }
  })

  return NextResponse.json({
    data: result,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  })
}
