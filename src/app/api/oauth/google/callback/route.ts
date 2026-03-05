import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens } from '@/lib/oauth/google'
import { encryptToolConfig } from '@/lib/tools/executor'

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

  // Decode state
  let state: { toolId: string; agentId: string; userId: string }
  try {
    state = JSON.parse(Buffer.from(stateB64, 'base64url').toString())
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

  // Fetch the tool to get client_id and client_secret
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

  // Decrypt existing config to get client_id / client_secret
  const { decryptToolConfig } = await import('@/lib/tools/executor')
  const config = decryptToolConfig(tool.config as Record<string, unknown>)
  const clientId = config.client_id as string
  const clientSecret = config.client_secret as string

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${appUrl}/agents?oauth_error=${encodeURIComponent('Missing OAuth credentials in tool config')}`
    )
  }

  const redirectUri = `${appUrl}/api/oauth/google/callback`

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri,
    })

    // Update tool config with tokens
    const updatedConfig = encryptToolConfig({
      ...config,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
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
