import 'server-only'
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { decryptSmtpPassword } from '@/lib/email/client'
import type { EmailSession } from '@/types/database'
import type { EmailAttachment } from './client'

export type IncomingEmail = {
  messageId: string
  from: string
  fromName: string | null
  subject: string
  body: string
  receivedAt: Date
  attachments?: EmailAttachment[]
}

function stripSignature(text: string): string {
  const match = text.match(/^([\s\S]*?)\n--\s*\n/m)
  if (match) return match[1].trim()
  return text.trim()
}

/** Test IMAP credentials — resolves true if auth succeeds, throws on failure */
export async function testImapConnection(opts: {
  host: string
  port: number
  user: string
  password: string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: opts.user,
      password: opts.password,
      host: opts.host,
      port: opts.port,
      tls: opts.port === 993,
      tlsOptions: { rejectUnauthorized: true },
      connTimeout: 10000,
      authTimeout: 8000,
    })
    imap.once('ready', () => { imap.end(); resolve() })
    imap.once('error', (err: Error) => reject(err))
    imap.connect()
  })
}

/** Fetch unseen emails from an IMAP inbox */
export async function pollImapInbox(
  session: EmailSession & { smtp_password_encrypted?: string | null; imap_password_encrypted?: string | null }
): Promise<IncomingEmail[]> {
  const host = session.imap_host
  const port = session.imap_port ?? 993
  const user = session.smtp_user
  const password =
    decryptSmtpPassword(session.imap_password_encrypted ?? null) ??
    decryptSmtpPassword(session.smtp_password_encrypted ?? null)

  if (!host || !user || !password) {
    throw new Error(`Session email ${session.id}: credentials IMAP incomplets`)
  }

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password,
      host,
      port,
      tls: port === 993,
      tlsOptions: { rejectUnauthorized: true },
      connTimeout: 15000,
      authTimeout: 10000,
    })

    const emails: IncomingEmail[] = []

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err) }

        imap.search(['UNSEEN'], (searchErr, uids) => {
          if (searchErr) { imap.end(); return reject(searchErr) }
          if (!uids || uids.length === 0) { imap.end(); return resolve([]) }

          const recentUids = uids.slice(-5)
          const fetch = imap.fetch(recentUids, { bodies: '', markSeen: true })
          const pending: Promise<void>[] = []

          fetch.on('message', (msg) => {
            const p = new Promise<void>((res) => {
              let buffer = ''
              msg.on('body', (stream) => {
                stream.on('data', (chunk: Buffer) => { buffer += chunk.toString() })
                stream.once('end', async () => {
                  try {
                    const parsed = await simpleParser(buffer)
                    const fromAddr = parsed.from?.value?.[0]

                    const attachments: EmailAttachment[] = (parsed.attachments || [])
                      .filter((a) => a.content && a.filename)
                      .map((a) => ({
                        filename: a.filename!,
                        content: a.content as Buffer,
                        contentType: a.contentType,
                      }))

                    emails.push({
                      messageId: parsed.messageId ?? `${Date.now()}-${Math.random()}`,
                      from: fromAddr?.address ?? '',
                      fromName: fromAddr?.name ?? null,
                      subject: parsed.subject ?? '(sans objet)',
                      body: typeof parsed.html === 'string' && parsed.html ? parsed.html : stripSignature(parsed.text ?? ''),
                      receivedAt: parsed.date ?? new Date(),
                      ...(attachments.length ? { attachments } : {}),
                    })
                  } catch { /* ignore parse errors */ }
                  res()
                })
              })
            })
            pending.push(p)
          })

          fetch.once('end', async () => {
            await Promise.all(pending)
            imap.end()
            resolve(emails)
          })

          fetch.once('error', (e) => { imap.end(); reject(e) })
        })
      })
    })

    imap.once('error', reject)
    imap.connect()
  })
}
