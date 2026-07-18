import { NextRequest, NextResponse } from 'next/server'
import { getScopedClient } from '@/lib/admin/impersonation'

/** GET /api/conversations — Lister les conversations de l'utilisateur (ou du
 *  client impersonné si un admin est « connecté en tant que »). */
export async function GET(req: NextRequest) {
  // ⚠️ getScopedClient : hors impersonation = client normal (RLS), en
  // impersonation = client service_role scopé par `userId`. On filtre TOUJOURS
  // par `user.id` ci-dessous (indispensable en impersonation).
  const scoped = await getScopedClient()
  if (!scoped) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { supabase } = scoped
  const user = { id: scoped.userId }

  // Parse query params for filters and pagination
  const { searchParams } = new URL(req.url)
  const sessionFilter = searchParams.get('session_id')
  const aiActiveFilter = searchParams.get('is_ai_active')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const lifecycleStageFilter = searchParams.get('lifecycle_stage_id')
  const rawSearch = searchParams.get('search')?.trim().toLowerCase()
  // Sanitize search to prevent PostgREST injection
  const searchQuery = rawSearch ? rawSearch.replace(/[%_\\]/g, '\\$&').slice(0, 100) : undefined
  const tagIdsParam = searchParams.get('tag_ids')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100))

  // Récupérer les sessions de l'utilisateur
  const { data: allSessions } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', user.id)

  const sessions = allSessions ?? []

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

  // Filter by channel (WhatsApp uniquement)
  query = query.eq('channel', 'whatsapp')

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
