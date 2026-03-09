import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens } from '@/lib/oauth/google'
import { encryptToolConfig } from '@/lib/tools/executor'
import { encryptMessage } from '@/lib/crypto/encryption'
import { createHmac } from 'crypto'

/**
 * GET /api/oauth/google/callback
 * Google redirects here after user grants consent.
 * Exchanges code for tokens, stores them encrypted in agent_tools config.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateB64 = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent(error)}`
    )
  }

  if (!code || !stateB64) {
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent('Missing code or state')}`
    )
  }

  // Decode state and verify HMAC signature (prevent CSRF)
  let state: { toolId: string; agentId: string; userId: string; credentialId?: string; ts?: number }
  try {
    const stateWrapper = JSON.parse(Buffer.from(stateB64, 'base64url').toString())

    // Support new signed format { d, s } and legacy unsigned format
    if (stateWrapper.d && stateWrapper.s) {
      const hmacSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret'
      const expectedSig = createHmac('sha256', hmacSecret).update(stateWrapper.d).digest('hex').slice(0, 16)
      if (stateWrapper.s !== expectedSig) {
        return NextResponse.redirect(
          `${appUrl}/agents?oauth_error=${encodeURIComponent('Invalid state signature')}`
        )
      }
      state = JSON.parse(stateWrapper.d)

      // Reject states older than 15 minutes
      if (state.ts && Date.now() - state.ts > 15 * 60 * 1000) {
        return NextResponse.redirect(
          `${appUrl}/agents?oauth_error=${encodeURIComponent('State expired')}`
        )
      }
    } else {
      // Legacy unsigned format (backwards compatibility)
      state = stateWrapper
    }
  } catch {
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent('Invalid state')}`
    )
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user || user.id !== state.userId) {
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent('Non authentifié')}`
    )
  }

  // Resolve client_id / client_secret from credential or tool config
  let clientId: string
  let clientSecret: string

  if (state.credentialId) {
    // Shared credential — get client_id/secret from oauth_credentials
    const { decryptMessage } = await import('@/lib/crypto/encryption')
    const { data: cred, error: credError } = await supabase
      .from('oauth_credentials')
      .select('client_id, client_secret')
      .eq('id', state.credentialId)
      .eq('user_id', user.id)
      .single()

    if (credError || !cred) {
      return NextResponse.redirect(
        `${appUrl}/agents?oauth_error=${encodeURIComponent('Credential not found')}`
      )
    }

    clientId = cred.client_id
    clientSecret = decryptMessage(cred.client_secret)
  } else {
    // Legacy — get from tool config
    const { data: tool, error: toolError } = await supabase
      .from('agent_tools')
      .select('*')
      .eq('id', state.toolId)
      .eq('agent_id', state.agentId)
      .eq('user_id', user.id)
      .single()

    if (toolError || !tool) {
      return NextResponse.redirect(
        `${appUrl}/agents?oauth_error=${encodeURIComponent('Tool not found')}`
      )
    }

    const { decryptToolConfig } = await import('@/lib/tools/executor')
    const config = decryptToolConfig(tool.config as Record<string, unknown>)
    clientId = config.client_id as string
    clientSecret = config.client_secret as string
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent('Missing OAuth credentials')}`
    )
  }

  // Debug: log partial client_id to verify correct credential is being used
  console.log(`[OAuth Callback] client_id: ${clientId.slice(0, 15)}..., secret length: ${clientSecret.length}, credentialId: ${state.credentialId || 'inline'}`)

  const redirectUri = `${appUrl}/api/oauth/google/callback`

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri,
    })

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    if (state.credentialId) {
      // Store tokens in the shared credential
      await supabase
        .from('oauth_credentials')
        .update({
          access_token: encryptMessage(tokens.access_token),
          refresh_token: encryptMessage(tokens.refresh_token),
          token_expires_at: tokenExpiresAt,
          is_connected: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.credentialId)
        .eq('user_id', user.id)

      // Mark the tool as oauth_connected too
      await supabase
        .from('agent_tools')
        .update({
          config: { oauth_connected: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.toolId)
        .eq('user_id', user.id)
    } else {
      // Legacy: store tokens in tool config
      const { data: tool } = await supabase
        .from('agent_tools')
        .select('config')
        .eq('id', state.toolId)
        .eq('user_id', user.id)
        .single()

      const { decryptToolConfig } = await import('@/lib/tools/executor')
      const existingConfig = tool ? decryptToolConfig(tool.config as Record<string, unknown>) : {}

      const updatedConfig = encryptToolConfig({
        ...existingConfig,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
        oauth_connected: true,
      })

      await supabase
        .from('agent_tools')
        .update({
          config: updatedConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.toolId)
        .eq('user_id', user.id)
    }

    return NextResponse.redirect(
      `${appUrl}/agents?oauth_success=true&tool_id=${state.toolId}`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    console.error('[OAuth Callback] Error:', message)
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent(message)}`
    )
  }
}
