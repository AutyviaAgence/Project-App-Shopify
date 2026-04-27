import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { decryptMessage, encryptMessage } from '@/lib/crypto/encryption'

const PUBSUB_TOPIC = 'projects/ferrous-record-472712-t9/topics/AutyviaApp'

/**
 * POST /api/email-sessions/watch
 * Active Gmail Watch sur toutes les sessions Gmail connectées.
 * À appeler après connexion OAuth ou via cron hebdomadaire (watch expire après 7 jours).
 */
export async function POST() {
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (adminSupabase as any)
    .from('email_sessions')
    .select('*')
    .eq('provider', 'gmail')
    .eq('status', 'connected')

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ watched: 0 })
  }

  let watched = 0
  for (const session of sessions) {
    try {
      const accessToken = await getValidToken(session, adminSupabase)

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName: PUBSUB_TOPIC,
          labelIds: ['INBOX'],
        }),
      })

      if (res.ok) {
        const data = await res.json() as { historyId: string; expiration: string }
        await adminSupabase
          .from('email_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', session.id)
        console.log(`[Gmail Watch] activated for ${session.email_address}, expires: ${data.expiration}`)
        watched++
      } else {
        const err = await res.json().catch(() => ({}))
        console.error(`[Gmail Watch] failed for ${session.email_address}:`, err)
      }
    } catch (err) {
      console.error(`[Gmail Watch] error for ${session.email_address}:`, err)
    }
  }

  return NextResponse.json({ watched })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getValidToken(session: Record<string, any>, adminSupabase: any): Promise<string> {
  const accessToken = decryptMessage(session.oauth_access_token_encrypted as string)
  const refreshToken = decryptMessage(session.oauth_refresh_token_encrypted as string)
  const expiresAt = session.oauth_expires_at ? new Date(session.oauth_expires_at as string).getTime() : 0

  if (Date.now() + 60_000 >= expiresAt) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json() as { access_token: string; expires_in: number }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adminSupabase as any)
      .from('email_sessions')
      .update({
        oauth_access_token_encrypted: encryptMessage(data.access_token),
        oauth_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      })
      .eq('id', session.id)
    return data.access_token
  }

  return accessToken
}
