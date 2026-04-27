import 'server-only'
import { decryptMessage, encryptMessage } from '@/lib/crypto/encryption'
import { createClient as createAdminClient } from '@supabase/supabase-js'

type GmailSession = {
  id: string
  oauth_access_token_encrypted: string | null
  oauth_refresh_token_encrypted: string | null
  oauth_expires_at: string | null
  email_address: string
  display_name: string | null
}

type IncomingGmailMessage = {
  messageId: string
  from: string
  fromName: string | null
  subject: string
  body: string
  receivedAt: Date
}

/** Get a valid access token, refreshing if expired */
async function getValidAccessToken(session: GmailSession): Promise<string> {
  if (!session.oauth_access_token_encrypted || !session.oauth_refresh_token_encrypted) {
    throw new Error('Session Gmail non connectée — tokens OAuth manquants')
  }

  const accessToken = decryptMessage(session.oauth_access_token_encrypted)
  const refreshToken = decryptMessage(session.oauth_refresh_token_encrypted)

  // Refresh if expired or expiring in the next 60s
  const expiresAt = session.oauth_expires_at ? new Date(session.oauth_expires_at).getTime() : 0
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
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error_description || 'Failed to refresh Gmail token')

    // Persist new access token
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await adminSupabase
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

/** Send an email via Gmail API */
export async function sendEmailViaGmail(
  session: GmailSession,
  to: string,
  subject: string,
  body: string,
  options?: { inReplyTo?: string }
): Promise<void> {
  const accessToken = await getValidAccessToken(session)

  const from = session.display_name
    ? `${session.display_name} <${session.email_address}>`
    : session.email_address

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    ...(options?.inReplyTo ? [`In-Reply-To: ${options.inReplyTo}`, `References: ${options.inReplyTo}`] : []),
  ].join('\r\n')

  const raw = Buffer.from(`${headers}\r\n\r\n${body}`).toString('base64url')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail send error: ${res.status}`)
  }
}

/** Poll unread emails from Gmail inbox */
export async function pollGmailInbox(session: GmailSession): Promise<IncomingGmailMessage[]> {
  const accessToken = await getValidAccessToken(session)

  // List unread messages in INBOX
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=20',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail list error: ${listRes.status}`)
  }

  const listData = await listRes.json()
  console.log('[pollGmailInbox]', session.email_address, 'unread count:', listData.messages?.length ?? 0, 'resultSizeEstimate:', listData.resultSizeEstimate)
  const messages: IncomingGmailMessage[] = []

  if (!listData.messages || listData.messages.length === 0) return []

  await Promise.all(
    listData.messages.map(async (msg: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!msgRes.ok) return

      const msgData = await msgRes.json()
      const headers = (msgData.payload?.headers || []) as { name: string; value: string }[]

      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

      const fromRaw = getHeader('From')
      // Parse "Name <email>" format
      const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/)
      const fromName = fromMatch ? fromMatch[1].trim().replace(/^"|"$/g, '') : null
      const fromEmail = fromMatch ? fromMatch[2] : fromRaw

      // Get body — prefer plain text
      let body = ''
      const parts = msgData.payload?.parts || []
      const textPart = parts.find((p: { mimeType: string }) => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
      } else if (msgData.payload?.body?.data) {
        body = Buffer.from(msgData.payload.body.data, 'base64').toString('utf-8')
      }

      messages.push({
        messageId: msg.id,
        from: fromEmail,
        fromName,
        subject: getHeader('Subject') || '(sans objet)',
        body,
        receivedAt: new Date(parseInt(msgData.internalDate)),
      })

      // Mark as read
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      })
    })
  )

  return messages
}
