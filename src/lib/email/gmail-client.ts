import 'server-only'
import { decryptMessage, encryptMessage } from '@/lib/crypto/encryption'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { EmailAttachment } from './client'

type GmailSession = {
  id: string
  oauth_access_token_encrypted: string | null
  oauth_refresh_token_encrypted: string | null
  oauth_expires_at: string | null
  email_address: string
  display_name: string | null
  signature?: string | null
}

type IncomingGmailMessage = {
  messageId: string
  from: string
  fromName: string | null
  subject: string
  body: string
  receivedAt: Date
  attachments?: EmailAttachment[]
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

function sanitizeHeader(value: string): string {
  return value.replace(/\r\n|\r|\n/g, ' ').trim()
}

/** Build a multipart/mixed MIME message with optional attachments */
function buildMimeMessage(opts: {
  from: string
  to: string
  subject: string
  body: string
  inReplyTo?: string
  attachments?: EmailAttachment[]
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const baseHeaders = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
  ]

  if (!opts.attachments?.length) {
    return [
      ...baseHeaders,
      'Content-Type: text/plain; charset=utf-8',
      '',
      opts.body,
    ].join('\r\n')
  }

  const parts: string[] = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body,
  ]

  for (const att of opts.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.filename}"`,
      '',
      att.content.toString('base64'),
    )
  }

  parts.push(`--${boundary}--`)
  return parts.join('\r\n')
}

/** Send an email via Gmail API */
export async function sendEmailViaGmail(
  session: GmailSession,
  to: string,
  subject: string,
  body: string,
  options?: { inReplyTo?: string; attachments?: EmailAttachment[] }
): Promise<void> {
  const accessToken = await getValidAccessToken(session)

  const safeDisplayName = session.display_name ? sanitizeHeader(session.display_name) : null
  const safeEmail = sanitizeHeader(session.email_address)
  const safeTo = sanitizeHeader(to)
  const safeSubject = sanitizeHeader(subject)

  const from = safeDisplayName ? `${safeDisplayName} <${safeEmail}>` : safeEmail

  const fullBody = session.signature
    ? `${body}\n\n--\n${session.signature}`
    : body

  const mime = buildMimeMessage({
    from,
    to: safeTo,
    subject: safeSubject,
    body: fullBody,
    inReplyTo: options?.inReplyTo,
    attachments: options?.attachments,
  })

  const raw = Buffer.from(mime).toString('base64url')

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

type GmailPart = {
  mimeType?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  filename?: string
  parts?: GmailPart[]
}

function extractBody(payload: GmailPart): string {
  const html = findPart(payload, 'text/html')
  if (html) return html

  const plain = findPart(payload, 'text/plain')
  if (plain) return stripSignature(plain)

  if (payload?.body?.data) return stripSignature(Buffer.from(payload.body.data, 'base64').toString('utf-8'))
  return ''
}

function stripSignature(text: string): string {
  const match = text.match(/^([\s\S]*?)\n--\s*\n/m)
  if (match) return match[1].trim()
  return text.trim()
}

function findPart(part: GmailPart, mimeType: string): string {
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, 'base64').toString('utf-8')
  }
  for (const child of part.parts || []) {
    const result = findPart(child, mimeType)
    if (result) return result
  }
  return ''
}

function collectAttachmentMeta(payload: GmailPart): { filename: string; attachmentId: string; mimeType: string }[] {
  const result: { filename: string; attachmentId: string; mimeType: string }[] = []
  if (payload.filename && payload.body?.attachmentId) {
    result.push({ filename: payload.filename, attachmentId: payload.body.attachmentId, mimeType: payload.mimeType ?? 'application/octet-stream' })
  }
  for (const child of payload.parts || []) {
    result.push(...collectAttachmentMeta(child))
  }
  return result
}

/** Poll unread emails from Gmail inbox */
export async function pollGmailInbox(session: GmailSession & { created_at?: string }): Promise<IncomingGmailMessage[]> {
  const accessToken = await getValidAccessToken(session)

  const afterEpoch = session.created_at
    ? Math.floor(new Date(session.created_at).getTime() / 1000)
    : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)

  const q = encodeURIComponent(`is:unread after:${afterEpoch}`)
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=${q}&maxResults=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail list error: ${listRes.status}`)
  }

  const listData = await listRes.json()
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
      const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/)
      const fromName = fromMatch ? fromMatch[1].trim().replace(/^"|"$/g, '') : null
      const fromEmail = fromMatch ? fromMatch[2] : fromRaw

      const body = extractBody(msgData.payload)

      // Fetch attachments metadata and download them
      const attMeta = collectAttachmentMeta(msgData.payload)
      const attachments: EmailAttachment[] = []
      await Promise.all(
        attMeta.map(async (meta) => {
          try {
            const attRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${meta.attachmentId}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            if (!attRes.ok) return
            const attData = await attRes.json()
            if (attData.data) {
              attachments.push({
                filename: meta.filename,
                content: Buffer.from(attData.data, 'base64url'),
                contentType: meta.mimeType,
              })
            }
          } catch { /* ignore attachment fetch errors */ }
        })
      )

      messages.push({
        messageId: msg.id,
        from: fromEmail,
        fromName,
        subject: getHeader('Subject') || '(sans objet)',
        body,
        receivedAt: new Date(parseInt(msgData.internalDate)),
        ...(attachments.length ? { attachments } : {}),
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
