import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/alerts — Liste des alertes de l'utilisateur */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unread') === 'true'
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10))
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  let query = supabase
    .from('user_alerts')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data: alerts, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compte des non lues
  const { count: unreadCount } = await supabase
    .from('user_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return NextResponse.json({
    data: alerts || [],
    total: count || 0,
    unread_count: unreadCount || 0,
  })
}

/** POST /api/alerts — Créer une alerte (usage interne/webhook) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { alert_type, title, message, metadata } = body as {
    alert_type: string
    title: string
    message: string
    metadata?: Record<string, unknown>
  }

  if (!alert_type || !title || !message) {
    return NextResponse.json({ error: 'alert_type, title et message requis' }, { status: 400 })
  }

  const validTypes = ['session_disconnected', 'quota_reached', 'ai_error', 'webhook_error', 'info']
  if (!validTypes.includes(alert_type)) {
    return NextResponse.json({ error: 'Type d\'alerte invalide' }, { status: 400 })
  }

  const { data: alert, error } = await supabase
    .from('user_alerts')
    .insert({
      user_id: user.id,
      alert_type: alert_type as 'session_disconnected' | 'quota_reached' | 'ai_error' | 'webhook_error' | 'info',
      title,
      message,
      metadata: metadata || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: alert }, { status: 201 })
}

/** PATCH /api/alerts — Marquer des alertes comme lues */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { alert_ids, mark_all_read } = body as {
    alert_ids?: string[]
    mark_all_read?: boolean
  }

  if (mark_all_read) {
    const { error } = await supabase
      .from('user_alerts')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, marked_all: true })
  }

  if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
    return NextResponse.json({ error: 'alert_ids requis ou mark_all_read' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_alerts')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .in('id', alert_ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, marked: alert_ids.length })
}

/** DELETE /api/alerts — Supprimer des alertes */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const alertId = searchParams.get('id')
  const deleteAll = searchParams.get('all') === 'true'
  const deleteRead = searchParams.get('read') === 'true'

  if (deleteAll) {
    const { error } = await supabase
      .from('user_alerts')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted_all: true })
  }

  if (deleteRead) {
    const { error } = await supabase
      .from('user_alerts')
      .delete()
      .eq('user_id', user.id)
      .eq('is_read', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted_read: true })
  }

  if (!alertId) {
    return NextResponse.json({ error: 'id requis' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_alerts')
    .delete()
    .eq('id', alertId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
