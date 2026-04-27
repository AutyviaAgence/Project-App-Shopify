import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { exchangeCodeForTokens } from '@/lib/oauth/google'
import { encryptMessage } from '@/lib/crypto/encryption'
import { createHmac } from 'crypto'

/**
 * GET /api/oauth/gmail-session/callback
 * Reçoit le code OAuth Gmail, échange contre des tokens,
 * met à jour la email_session avec les tokens et l'adresse email réelle.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateB64 = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  console.log('[Gmail Session Callback] received', { code: !!code, state: !!stateB64, error })

  if (error) {
    console.log('[Gmail Session Callback] Google error:', error)
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent(error)}`)
  }

  if (!code || !stateB64) {
    console.log('[Gmail Session Callback] Missing code or state')
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Missing code or state')}`)
  }

  // Vérifier le state
  let state: { emailSessionId: string; userId: string; ts: number }
  try {
    const wrapper = JSON.parse(Buffer.from(stateB64, 'base64url').toString())
    const hmacSecret = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const expectedSig = createHmac('sha256', hmacSecret).update(wrapper.d).digest('hex').slice(0, 16)
    if (wrapper.s !== expectedSig) {
      console.log('[Gmail Session Callback] Invalid state signature')
      return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Invalid state signature')}`)
    }
    state = JSON.parse(wrapper.d)
    if (Date.now() - state.ts > 15 * 60 * 1000) {
      console.log('[Gmail Session Callback] State expired')
      return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('State expired')}`)
    }
  } catch (e) {
    console.log('[Gmail Session Callback] State parse error:', e)
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Invalid state')}`)
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  console.log('[Gmail Session Callback] auth user:', user?.id, 'state userId:', state.userId)

  if (authError || !user || user.id !== state.userId) {
    console.log('[Gmail Session Callback] Auth failed:', { authError: authError?.message, hasUser: !!user, match: user?.id === state.userId })
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Non authentifié')}`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${appUrl}/api/oauth/gmail-session/callback`

  console.log('[Gmail Session Callback] exchanging code, redirectUri:', redirectUri)
  try {
    const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri })

    // Récupérer l'adresse email réelle du compte Google choisi
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoRes.json() as { email?: string; name?: string }
    const gmailAddress = userInfo.email || 'unknown@gmail.com'

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await adminSupabase
      .from('email_sessions')
      .update({
        email_address: gmailAddress,
        status: 'connected',
        oauth_access_token_encrypted: encryptMessage(tokens.access_token),
        oauth_refresh_token_encrypted: encryptMessage(tokens.refresh_token),
        oauth_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        // Mettre à jour le display_name si pas déjà défini
        updated_at: new Date().toISOString(),
      })
      .eq('id', state.emailSessionId)
      .eq('user_id', user.id)

    return NextResponse.redirect(`${appUrl}/sessions?oauth_success=gmail&tab=email`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    console.error('[Gmail Session OAuth] Error:', message)

    // Supprimer la session en attente si l'OAuth a échoué
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await adminSupabase.from('email_sessions').delete().eq('id', state.emailSessionId)

    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent(message)}`)
  }
}
