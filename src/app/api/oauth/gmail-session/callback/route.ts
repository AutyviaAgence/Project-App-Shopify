import { NextRequest, NextResponse } from 'next/server'
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

  if (error) {
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent(error)}`)
  }

  if (!code || !stateB64) {
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Missing code or state')}`)
  }

  // Vérifier le state
  let state: { emailSessionId: string; userId: string; ts: number }
  try {
    const wrapper = JSON.parse(Buffer.from(stateB64, 'base64url').toString())
    const hmacSecret = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const expectedSig = createHmac('sha256', hmacSecret).update(wrapper.d).digest('hex').slice(0, 16)
    if (wrapper.s !== expectedSig) {
      return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Invalid state signature')}`)
    }
    state = JSON.parse(wrapper.d)
    if (Date.now() - state.ts > 15 * 60 * 1000) {
      return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('State expired')}`)
    }
  } catch {
    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent('Invalid state')}`)
  }

  // Le state HMAC signé garantit l'identité — pas besoin de vérifier la session Supabase
  // (le cookie peut être perdu pendant le redirect Google)
  const { userId, emailSessionId } = state

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${appUrl}/api/oauth/gmail-session/callback`

  try {
    const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri })

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
        updated_at: new Date().toISOString(),
      })
      .eq('id', emailSessionId)
      .eq('user_id', userId)

    // Activer Gmail Watch pour les notifications temps réel
    const watchRes = await fetch(`${appUrl}/api/email-sessions/watch`, { method: 'POST' })
    if (!watchRes.ok) console.error('[Gmail Session OAuth] Watch failed:', await watchRes.text())

    return NextResponse.redirect(`${appUrl}/sessions?oauth_success=gmail&tab=email`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    console.error('[Gmail Session OAuth] Error:', message)

    // Supprimer la session en attente si l'OAuth a échoué
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await adminSupabase.from('email_sessions').delete().eq('id', emailSessionId)

    return NextResponse.redirect(`${appUrl}/sessions?oauth_error=${encodeURIComponent(message)}`)
  }
}
