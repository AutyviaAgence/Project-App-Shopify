import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGoogleAuthUrl } from '@/lib/oauth/google'
import { decryptMessage } from '@/lib/crypto/encryption'
import { createHmac } from 'crypto'

/**
 * POST /api/oauth/google/authorize
 * Body: { clientId, clientSecret, toolId, agentId, toolType, credentialId? }
 * When credentialId is provided, reads client_id/secret from oauth_credentials.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { toolId, agentId, toolType, credentialId } = body
  let { clientId, clientSecret } = body

  if (!toolId || !agentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If using a shared credential, resolve client_id/secret from DB
  if (credentialId) {
    const { data: cred, error: credError } = await supabase
      .from('oauth_credentials')
      .select('client_id, client_secret')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single()

    if (credError || !cred) {
      return NextResponse.json({ error: 'Credential introuvable' }, { status: 404 })
    }

    clientId = cred.client_id!
    clientSecret = cred.client_secret ? decryptMessage(cred.client_secret) : ''
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing client_id or client_secret' }, { status: 400 })
  }

  // Build state payload with HMAC signature to prevent CSRF/forgery
  const stateData = JSON.stringify({
    toolId,
    agentId,
    userId: user.id,
    credentialId: credentialId || undefined,
    ts: Date.now(),
  })
  const hmacSecret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!hmacSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const signature = createHmac('sha256', hmacSecret).update(stateData).digest('hex').slice(0, 16)
  const statePayload = JSON.stringify({ d: stateData, s: signature })
  const state = Buffer.from(statePayload).toString('base64url')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/oauth/google/callback`

  const authUrl = buildGoogleAuthUrl({
    clientId,
    redirectUri,
    toolType: toolType || 'google_calendar',
    state,
  })

  return NextResponse.json({ url: authUrl })
}
