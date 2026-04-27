import 'server-only'
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { decryptSmtpPassword } from '@/lib/email/client'
import type { EmailSession } from '@/types/database'

export type IncomingEmail = {
  messageId: string
  from: string
  fromName: string | null
  subject: string
  body: string
  receivedAt: Date
}

function stripSignature(text: string): string {
  const match = text.match(/^([\s\S]*?)\n--\s*\n/m)
  if (match) return match[1].trim()
  return text.trim()
}

/** Fetch unseen emails from an IMAP inbox */
export async function pollImapInbox(
  session: EmailSession & { smtp_password_encrypted?: string | null; imap_password_encrypted?: string | null }
): Promise<IncomingEmail[]> {
  const host = session.imap_host
  const port = session.imap_port ?? 993
  const user = session.smtp_user
  // Try imap-specific password first, fall back to smtp password
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
      tlsOptions: { rejectUnauthorized: false },
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

          // Take only the 5 most recent unseen messages
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
                    emails.push({
                      messageId: parsed.messageId ?? `${Date.now()}-${Math.random()}`,
                      from: fromAddr?.address ?? '',
                      fromName: fromAddr?.name ?? null,
                      subject: parsed.subject ?? '(sans objet)',
                      body: stripSignature(parsed.text ?? (typeof parsed.html === 'string' ? parsed.html : '') ?? ''),
                      receivedAt: parsed.date ?? new Date(),
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
