import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGoogleAuthUrl } from '@/lib/oauth/google'
import { createHmac } from 'crypto'

/**
 * POST /api/oauth/google/authorize
 * Body: { clientId, clientSecret, toolId, agentId, toolType }
 * Stores credentials temporarily in the tool config, then redirects to Google OAuth
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { clientId, clientSecret, toolId, agentId, toolType } = body

  if (!clientId || !clientSecret || !toolId || !agentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Build state payload with HMAC signature to prevent CSRF/forgery
  const stateData = JSON.stringify({
    toolId,
    agentId,
    userId: user.id,
    ts: Date.now(),
  })
  const hmacSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret'
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
