import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptMessage } from '@/lib/crypto/encryption'

/** DELETE /api/email-sessions/[id] — Supprimer une session email */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/** PATCH /api/email-sessions/[id] — Modifier une session email */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { name, display_name, smtp_host, smtp_port, smtp_user, smtp_password, imap_host, imap_port, status } = body as {
    name?: string
    display_name?: string
    smtp_host?: string
    smtp_port?: number
    smtp_user?: string
    smtp_password?: string
    imap_host?: string
    imap_port?: number
    status?: string
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (display_name !== undefined) updates.display_name = display_name
  if (smtp_host !== undefined) updates.smtp_host = smtp_host
  if (smtp_port !== undefined) updates.smtp_port = smtp_port
  if (smtp_user !== undefined) updates.smtp_user = smtp_user
  if (smtp_password !== undefined) updates.smtp_password_encrypted = encryptMessage(smtp_password)
  if (imap_host !== undefined) updates.imap_host = imap_host
  if (imap_port !== undefined) updates.imap_port = imap_port
  if (status !== undefined) updates.status = status
  updates.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('email_sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, user_id, team_id, name, email_address, provider, status, smtp_host, smtp_port, smtp_user, imap_host, imap_port, display_name, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ...data, channel: 'email' } })
}
