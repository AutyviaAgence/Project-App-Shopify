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
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

  // Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', user.id)

  if (!sessions || sessions.length === 0) {
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

  // Assembler les données
  const result = conversations.map((conv) => ({
    ...conv,
    contact: contactsMap[conv.contact_id] || null,
    session: {
      id: sessionsMap[conv.session_id]?.id,
      instance_name: sessionsMap[conv.session_id]?.instance_name,
      phone_number: sessionsMap[conv.session_id]?.phone_number,
    },
  }))

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
