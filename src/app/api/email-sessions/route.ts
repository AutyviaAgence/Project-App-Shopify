import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptMessage } from '@/lib/crypto/encryption'
import { checkPlanQuota } from '@/lib/plan-quota'

/** GET /api/email-sessions — Lister les sessions email de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('email_sessions')
    .select('id, user_id, team_id, name, email_address, provider, status, smtp_host, smtp_port, smtp_user, imap_host, imap_port, display_name, daily_ai_message_limit, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: (data ?? []).map((s: Record<string, unknown>) => ({ ...s, channel: 'email' })) })
}

/** POST /api/email-sessions — Créer une session email SMTP */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier le quota de sessions (WhatsApp + Email combinés)
  const sessionQuota = await checkPlanQuota(supabase, user.id, 'sessions')
  if (!sessionQuota.allowed) {
    const error = sessionQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des sessions.'
      : sessionQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer une session email. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${sessionQuota.plan} inclut ${sessionQuota.limit} session(s). Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: sessionQuota.reason,
      limit: sessionQuota.limit,
      current: sessionQuota.current,
    }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    name,
    email_address,
    provider,
    display_name,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_password,
    imap_host,
    imap_port,
    team_id,
  } = body as {
    name?: string
    email_address?: string
    provider?: string
    display_name?: string
    smtp_host?: string
    smtp_port?: number
    smtp_user?: string
    smtp_password?: string
    imap_host?: string
    imap_port?: number
    team_id?: string
  }

  if (!name || !email_address || !provider) {
    return NextResponse.json({ error: 'name, email_address et provider sont requis' }, { status: 400 })
  }

  if (!['gmail', 'outlook', 'smtp'].includes(provider)) {
    return NextResponse.json({ error: 'provider doit être gmail, outlook ou smtp' }, { status: 400 })
  }

  if (provider === 'smtp' && (!smtp_host || !smtp_port || !smtp_user || !smtp_password)) {
    return NextResponse.json({ error: 'Credentials SMTP requis : smtp_host, smtp_port, smtp_user, smtp_password' }, { status: 400 })
  }

  const encryptedPassword = smtp_password ? encryptMessage(smtp_password) : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error } = await (supabase as any)
    .from('email_sessions')
    .insert({
      user_id: user.id,
      team_id: team_id ?? null,
      name,
      email_address,
      provider,
      display_name: display_name ?? null,
      status: 'connected',
      smtp_host: smtp_host ?? null,
      smtp_port: smtp_port ?? null,
      smtp_user: smtp_user ?? null,
      smtp_password_encrypted: encryptedPassword,
      imap_host: imap_host ?? null,
      imap_port: imap_port ?? null,
    })
    .select('id, user_id, team_id, name, email_address, provider, status, smtp_host, smtp_port, smtp_user, imap_host, imap_port, display_name, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ...session, channel: 'email' } })
}
