import 'server-only'
import nodemailer from 'nodemailer'
import { decryptMessage } from '@/lib/crypto/encryption'
import type { EmailSession } from '@/types/database'

export type IncomingEmail = {
  messageId: string
  from: string
  fromName: string | null
  subject: string
  body: string
  receivedAt: Date
  attachments?: EmailAttachment[]
}

export type EmailAttachment = {
  filename: string
  content: Buffer
  contentType: string
}

function getSmtpCredentials(session: EmailSession) {
  const host = session.smtp_host
  const port = session.smtp_port ?? 587
  const user = session.smtp_user
  return { host, port, user }
}

/** Decrypt an SMTP password stored encrypted in the DB */
export function decryptSmtpPassword(encrypted: string | null): string | null {
  if (!encrypted) return null
  return decryptMessage(encrypted)
}

/** Send an email via SMTP using the session's credentials */
export async function sendEmailViaSmtp(
  session: EmailSession & { smtp_password_encrypted?: string | null; signature?: string | null },
  to: string,
  subject: string,
  body: string,
  options?: { replyToMessageId?: string; inReplyTo?: string; attachments?: EmailAttachment[] }
): Promise<void> {
  const { host, port, user } = getSmtpCredentials(session)
  const password = decryptSmtpPassword(session.smtp_password_encrypted ?? null)

  if (!host || !user || !password) {
    throw new Error('Credentials SMTP incomplets sur la session email')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  })

  const fullBody = session.signature
    ? `${body}\n\n--\n${session.signature}`
    : body

  await transporter.sendMail({
    from: session.display_name
      ? `"${session.display_name}" <${session.email_address}>`
      : session.email_address,
    to,
    subject,
    text: fullBody,
    ...(options?.inReplyTo ? { inReplyTo: options.inReplyTo, references: options.inReplyTo } : {}),
    ...(options?.attachments?.length ? {
      attachments: options.attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      }))
    } : {}),
  })
}
