import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGoogleAuthUrl } from '@/lib/oauth/google'
import { createHmac } from 'crypto'
import { checkPlanQuota } from '@/lib/plan-quota'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

/**
 * POST /api/oauth/gmail-session/authorize
 * Body: { session_name, display_name? }
 * Crée une email_session en état "pending" puis lance le flow OAuth Gmail.
 * Toujours avec prompt=select_account pour forcer le choix du compte Gmail.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { session_name, display_name } = body as { session_name?: string; display_name?: string }

  if (!session_name) {
    return NextResponse.json({ error: 'session_name requis' }, { status: 400 })
  }

  // Vérifier le quota de sessions (WhatsApp + Email combinés)
  const sessionQuota = await checkPlanQuota(supabase, user.id, 'sessions')
  if (!sessionQuota.allowed) {
    const error = sessionQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des sessions.'
      : sessionQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer une session email.'
      : `Limite atteinte : votre plan ${sessionQuota.plan} inclut ${sessionQuota.limit} session(s). Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({ error, quota_exceeded: true, reason: sessionQuota.reason, limit: sessionQuota.limit, current: sessionQuota.current }, { status: 403 })
  }

  // Créer la session email en état "disconnected" (sera mis à jour après OAuth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emailSession, error: sessionError } = await (supabase as any)
    .from('email_sessions')
    .insert({
      user_id: user.id,
      name: session_name,
      email_address: 'pending@gmail.com', // sera mis à jour après le callback
      provider: 'gmail',
      status: 'disconnected',
      display_name: display_name ?? null,
    })
    .select('id')
    .single()

  if (sessionError || !emailSession) {
    return NextResponse.json({ error: sessionError?.message || 'Erreur création session' }, { status: 500 })
  }

  const hmacSecret = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const stateData = JSON.stringify({
    emailSessionId: emailSession.id,
    userId: user.id,
    ts: Date.now(),
  })
  const signature = createHmac('sha256', hmacSecret).update(stateData).digest('hex').slice(0, 16)
  const state = Buffer.from(JSON.stringify({ d: stateData, s: signature })).toString('base64url')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/oauth/gmail-session/callback`

  // buildGoogleAuthUrl avec scopes Gmail + forceAccountSelect = true
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'select_account consent') // force choix du compte
  url.searchParams.set('state', state)

  return NextResponse.json({ url: url.toString(), session_id: emailSession.id })
}
