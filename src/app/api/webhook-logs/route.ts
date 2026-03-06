import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, buildAccessFilter } from '@/lib/teams/access'

/** GET /api/webhook-logs — Liste des logs webhook de l'utilisateur */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Parse query params
  const { searchParams } = new URL(req.url)
  const sessionFilter = searchParams.get('session_id')
  const eventFilter = searchParams.get('event_type')
  const statusFilter = searchParams.get('status')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100))

  // Get user's sessions (personal + team)
  const teamIds = await getUserTeamIds(supabase, user.id)

  let sessionsQuery = supabase
    .from('whatsapp_sessions')
    .select('id')

  if (teamIds.length > 0) {
    sessionsQuery = sessionsQuery.or(buildAccessFilter(user.id, teamIds))
  } else {
    sessionsQuery = sessionsQuery.eq('user_id', user.id)
  }

  const { data: sessions } = await sessionsQuery

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } })
  }

  // Validate UUIDs to prevent injection via .or() string interpolation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const sessionIds = sessions.map((s) => s.id).filter(id => uuidRegex.test(id))

  // Build query - include logs with null session_id (orphaned) OR matching sessions
  let query = supabase
    .from('webhook_logs')
    .select('*', { count: 'exact' })
    .or(`session_id.is.null,session_id.in.(${sessionIds.join(',')})`)

  // Apply filters
  if (sessionFilter && sessionIds.includes(sessionFilter)) {
    query = query.eq('session_id', sessionFilter)
  }
  if (eventFilter) {
    query = query.eq('event_type', eventFilter)
  }
  if (statusFilter && ['success', 'error', 'skipped'].includes(statusFilter)) {
    query = query.eq('status', statusFilter as 'success' | 'error' | 'skipped')
  }

  // Pagination
  const offset = (page - 1) * limit

  const { data: logs, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: logs || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  })
}

/** DELETE /api/webhook-logs — Supprimer les vieux logs (7+ jours) */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Get user's sessions (personal + team)
  const teamIds = await getUserTeamIds(supabase, user.id)

  let sessionsQuery = supabase
    .from('whatsapp_sessions')
    .select('id')

  if (teamIds.length > 0) {
    sessionsQuery = sessionsQuery.or(buildAccessFilter(user.id, teamIds))
  } else {
    sessionsQuery = sessionsQuery.eq('user_id', user.id)
  }

  const { data: sessions } = await sessionsQuery

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  const sessionIds = sessions.map((s) => s.id).filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)

  // Delete old logs for user's sessions (including orphaned logs)
  const { error, count } = await supabase
    .from('webhook_logs')
    .delete({ count: 'exact' })
    .or(`session_id.is.null,session_id.in.(${sessionIds.join(',')})`)
    .lt('created_at', cutoffDate.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: count || 0 })
}
