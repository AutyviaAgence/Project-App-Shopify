import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const lifecycleStageFilter = searchParams.get('lifecycle_stage_id')
  const channelFilter = searchParams.get('channel') // 'whatsapp' | 'email' | null (all)
  const rawSearch = searchParams.get('search')?.trim().toLowerCase()
  // Sanitize search to prevent PostgREST injection
  const searchQuery = rawSearch ? rawSearch.replace(/[%_\\]/g, '\\$&').slice(0, 100) : undefined
  const tagIdsParam = searchParams.get('tag_ids')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100))

  // Récupérer les sessions de l'utilisateur
  const sessionsQuery = supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', user.id)

  // Récupérer les sessions email de l'utilisateur en parallèle
  const [{ data: allSessions }, { data: emailSessions }] = await Promise.all([
    sessionsQuery,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('email_sessions').select('*').eq('user_id', user.id),
  ])

  const allWhatsAppSessions = allSessions ?? []
  const allEmailSessions = (emailSessions ?? []) as Array<{ id: string; user_id: string; team_id: string | null; name: string; email_address: string; provider: string; status: string; email_agent_id: string | null }>

  // Si filtre email, retourner uniquement les convs email
  if (channelFilter === 'email') {
    if (allEmailSessions.length === 0) {
      return NextResponse.json({ data: [], pagination: { page, limit: limit, total: 0, totalPages: 0 } })
    }
    const emailSessionIds = allEmailSessions.map((s) => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let emailConvQuery = (supabase as any)
      .from('conversations')
      .select('*', { count: 'exact' })
      .in('email_session_id', emailSessionIds)
      .eq('channel', 'email')
    if (sessionFilter && emailSessionIds.includes(sessionFilter)) {
      emailConvQuery = emailConvQuery.eq('email_session_id', sessionFilter)
    }
    const emailOffset = (page - 1) * limit
    const { data: emailConvs, count: emailCount } = await emailConvQuery
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(emailOffset, emailOffset + limit - 1)
    const contactIds = [...new Set((emailConvs || []).map((c: { contact_id: string }) => c.contact_id))] as string[]
    const { data: emailContacts } = contactIds.length > 0
      ? await supabase.from('contacts').select('*').in('id', contactIds)
      : { data: [] }
    const emailContactsMap = Object.fromEntries((emailContacts || []).map((c) => [c.id, c]))
    const emailSessionsMap = Object.fromEntries(allEmailSessions.map((s) => [s.id, s]))
    const emailResult = (emailConvs || []).map((conv: Record<string, unknown>) => ({
      ...conv,
      channel: 'email',
      contact: emailContactsMap[conv.contact_id as string] || null,
      session: {
        id: conv.email_session_id,
        instance_name: emailSessionsMap[conv.email_session_id as string]?.name ?? 'Email',
        phone_number: null,
        team_id: null,
        team_name: null,
        email_agent_id: emailSessionsMap[conv.email_session_id as string]?.email_agent_id ?? null,
      },
    }))
    return NextResponse.json({
      data: emailResult,
      pagination: { page, limit, total: emailCount || 0, totalPages: Math.ceil((emailCount || 0) / limit) },
    })
  }

  if (allWhatsAppSessions.length === 0 && channelFilter !== 'email') {
    return NextResponse.json({ data: [] })
  }

  const sessions = allWhatsAppSessions

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
      // FUSION : filtre par étiquettes lifecycle (liaison multi)
      const { data: tagAssignments } = await supabase
        .from('conversation_lifecycle_stages')
        .select('conversation_id')
        .in('stage_id', tagIds)

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

  // Filter by channel
  if (channelFilter === 'whatsapp') {
    query = query.eq('channel', 'whatsapp')
  } else if (!channelFilter || channelFilter === 'all') {
    // "Tous" : on veut uniquement les convs WhatsApp ici (les email sont mergées après)
    query = query.eq('channel', 'whatsapp')
  }

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

  const { data: contacts } = await supabase.from('contacts').select('*').in('id', contactIds)

  const contactsMap = Object.fromEntries((contacts || []).map((c) => [c.id, c]))

  // Assembler les données WhatsApp
  const result = conversations.map((conv) => {
    const session = sessionsMap[conv.session_id]
    return {
      ...conv,
      contact: contactsMap[conv.contact_id] || null,
      session: {
        id: session?.id,
        instance_name: session?.instance_name,
        phone_number: session?.phone_number,
      },
    }
  })

  // Pour l'onglet "Tous", merger les conversations email avec pagination correcte
  if (!channelFilter || channelFilter === 'all') {
    const emailSessionIds = allEmailSessions.map((s: { id: string }) => s.id)
    if (emailSessionIds.length > 0) {
      // Récupérer le vrai total email pour calculer la pagination globale
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: emailCount } = await (supabase as any)
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .in('email_session_id', emailSessionIds)
        .eq('channel', 'email')

      const totalEmail = emailCount || 0
      const totalAll = (count || 0) + totalEmail
      const totalPagesAll = Math.ceil(totalAll / limit)

      if (totalEmail > 0) {
        // Pour construire la page N du flux mixte trié par date, on doit récupérer
        // suffisamment des deux canaux. On prend les (page * limit) premiers de chaque
        // canal, on merge+trie, puis on extrait la tranche [offset, offset+limit).
        const fetchUpTo = page * limit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: emailConvs } = await (supabase as any)
          .from('conversations')
          .select('*')
          .in('email_session_id', emailSessionIds)
          .eq('channel', 'email')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(0, fetchUpTo - 1)

        // Refetch WhatsApp sans pagination pour avoir les fetchUpTo premiers aussi
        const { data: waConvsAll } = await query
          .order('is_pinned', { ascending: false })
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(0, fetchUpTo - 1)

        const emailSessionsMap = Object.fromEntries(allEmailSessions.map((s: { id: string; name: string; email_agent_id?: string | null }) => [s.id, s]))

        const emailContactIds = [...new Set((emailConvs || []).map((c: { contact_id: string }) => c.contact_id))] as string[]
        const waContactIds = [...new Set((waConvsAll || []).map((c: { contact_id: string }) => c.contact_id))] as string[]
        const allContactIds = [...new Set([...emailContactIds, ...waContactIds])]

        const { data: allContacts } = allContactIds.length > 0
          ? await supabase.from('contacts').select('*').in('id', allContactIds)
          : { data: [] }
        const allContactsMap = Object.fromEntries((allContacts || []).map((c) => [c.id, c]))

        const emailResult = (emailConvs || []).map((conv: Record<string, unknown>) => ({
          ...conv,
          channel: 'email',
          contact: allContactsMap[conv.contact_id as string] || null,
          session: {
            id: conv.email_session_id,
            instance_name: (emailSessionsMap[conv.email_session_id as string] as { name?: string })?.name ?? 'Email',
            phone_number: null,
            team_id: null,
            team_name: null,
            email_agent_id: (emailSessionsMap[conv.email_session_id as string] as { email_agent_id?: string | null })?.email_agent_id ?? null,
          },
        }))

        const waResult = (waConvsAll || []).map((conv: Record<string, unknown>) => {
          const session = sessionsMap[conv.session_id as string]
          return {
            ...conv,
            contact: allContactsMap[conv.contact_id as string] || null,
            session: {
              id: session?.id,
              instance_name: session?.instance_name,
              phone_number: session?.phone_number,
            },
          }
        })

        // Merger, trier par date, extraire la tranche de la page demandée
        const merged = [...waResult, ...emailResult].sort((a, b) => {
          const ta = (a as { is_pinned?: boolean }).is_pinned ? Infinity : (a as { last_message_at?: string }).last_message_at ? new Date((a as { last_message_at: string }).last_message_at).getTime() : 0
          const tb = (b as { is_pinned?: boolean }).is_pinned ? Infinity : (b as { last_message_at?: string }).last_message_at ? new Date((b as { last_message_at: string }).last_message_at).getTime() : 0
          return tb - ta
        })

        const pageData = merged.slice(offset, offset + limit)

        return NextResponse.json({
          data: pageData,
          pagination: { page, limit, total: totalAll, totalPages: totalPagesAll },
        })
      }

      // Pas d'emails : pagination WhatsApp normale avec total corrigé
      return NextResponse.json({
        data: result,
        pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
      })
    }
  }

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
