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
  const searchQuery = searchParams.get('search')?.trim().toLowerCase()
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

  // Filter by date range
  if (dateFrom) {
    query = query.gte('last_message_at', dateFrom)
  }
  if (dateTo) {
    query = query.lte('last_message_at', dateTo)
  }

  // Pagination: calculate offset
  const offset = (page - 1) * limit

  // Execute query with pagination
  const { data: conversations, error, count } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ data: [] })
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
  let result = conversations.map((conv) => {
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

  // Filtrer par recherche (côté serveur après avoir récupéré les contacts)
  let filteredCount = count || 0
  if (searchQuery) {
    result = result.filter((conv) => {
      const contact = conv.contact
      if (!contact) return false
      return (
        contact.phone_number?.includes(searchQuery) ||
        contact.name?.toLowerCase().includes(searchQuery) ||
        contact.first_name?.toLowerCase().includes(searchQuery) ||
        contact.last_name?.toLowerCase().includes(searchQuery) ||
        conv.last_message_preview?.toLowerCase().includes(searchQuery)
      )
    })
    filteredCount = result.length
  }

  return NextResponse.json({
    data: result,
    pagination: {
      page,
      limit,
      total: searchQuery ? filteredCount : (count || 0),
      totalPages: Math.ceil((searchQuery ? filteredCount : (count || 0)) / limit),
    },
  })
}
