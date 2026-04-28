import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { pollGmailInbox } from '@/lib/email/gmail-client'
import { encryptMessage } from '@/lib/crypto/encryption'

/**
 * Vérifie le JWT Bearer envoyé par Google Cloud Pub/Sub.
 * Google signe le token avec sa clé privée — on valide la signature
 * via les clés publiques de https://www.googleapis.com/oauth2/v1/certs
 */
async function verifyPubSubToken(token: string): Promise<boolean> {
  try {
    // Décoder le JWT sans vérification pour extraire kid et alg
    const [headerB64, payloadB64] = token.split('.')
    if (!headerB64 || !payloadB64) return false

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { kid?: string; alg?: string }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      email?: string; iss?: string; aud?: string; exp?: number
    }

    // Vérifier les claims de base sans crypto (si on n'a pas de lib JWT)
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now) return false // Token expiré
    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') return false

    // Vérifier que l'audience correspond à notre endpoint
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const expectedAud = `${appUrl}/api/webhook/gmail-pubsub`
    if (payload.aud && payload.aud !== expectedAud) {
      // Pub/Sub peut envoyer l'URL complète ou juste l'app URL — accepter les deux
      if (!payload.aud.includes('gmail-pubsub')) return false
    }

    // Vérifier que l'email vient bien du service account Pub/Sub Google
    // Le service account Pub/Sub a toujours le format @gcp-sa-pubsub.iam.gserviceaccount.com
    if (payload.email && !payload.email.endsWith('.gserviceaccount.com')) return false

    // Valider la signature via les clés publiques Google (fetch cached)
    const certsRes = await fetch('https://www.googleapis.com/oauth2/v1/certs', {
      next: { revalidate: 3600 }, // cache 1h
    } as RequestInit)
    if (!certsRes.ok) return false

    const certs = await certsRes.json() as Record<string, string>
    const certPem = header.kid ? certs[header.kid] : Object.values(certs)[0]
    if (!certPem) return false

    // Import de la clé publique et vérification de la signature
    const keyData = certPem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\s/g, '')

    const binaryKey = Buffer.from(keyData, 'base64')
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    ).catch(async () => {
      // Si import 'raw' échoue, essayer 'spki'
      return crypto.subtle.importKey(
        'spki',
        binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
    })

    const signingInput = `${headerB64}.${payloadB64}`
    const sigB64 = token.split('.')[2]
    if (!sigB64) return false
    const signature = Buffer.from(sigB64, 'base64url')

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      Buffer.from(signingInput)
    )

    return valid
  } catch {
    return false
  }
}

/**
 * POST /api/webhook/gmail-pubsub
 * Reçoit les notifications Pub/Sub de Gmail et traite les nouveaux emails.
 * Pub/Sub envoie un POST avec body: { message: { data: base64, messageId, publishTime }, subscription }
 */
export async function POST(req: NextRequest) {
  // Vérifier que la requête vient bien de Google Cloud Pub/Sub via JWT signé
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isValid = await verifyPubSubToken(token)
  if (!isValid) {
    console.warn('[gmail-pubsub] Invalid Pub/Sub JWT token')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()

    // Pub/Sub envoie les données en base64 dans message.data
    // Pour Gmail watch(), le payload contient emailAddress et historyId
    const messageData = body?.message?.data
    if (!messageData) {
      return NextResponse.json({ ok: true }) // ACK vide
    }

    const decoded = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8')) as {
      emailAddress?: string
      historyId?: string
    }

    const emailAddress = decoded.emailAddress
    if (!emailAddress) {
      return NextResponse.json({ ok: true })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Trouver la session Gmail correspondant à cet email
    const { data: session } = await adminSupabase
      .from('email_sessions')
      .select('*')
      .eq('email_address', emailAddress)
      .eq('provider', 'gmail')
      .eq('status', 'connected')
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ ok: true })
    }

    // Récupérer les nouveaux emails non lus
    const emails = await pollGmailInbox(session)
    if (emails.length === 0) {
      return NextResponse.json({ ok: true })
    }

    for (const email of emails) {
      // Trouver ou créer le contact
      let contactId: string

      const { data: existingContact } = await adminSupabase
        .from('contacts')
        .select('id')
        .eq('email', email.from)
        .eq('email_session_id', session.id)
        .maybeSingle()

      if (existingContact) {
        contactId = existingContact.id
      } else {
        const { data: newContact, error: contactError } = await adminSupabase
          .from('contacts')
          .insert({
            session_id: null,
            email_session_id: session.id,
            phone_number: email.from,
            email: email.from,
            name: email.fromName,
            first_name: email.fromName?.split(' ')[0] ?? null,
            last_name: email.fromName?.split(' ').slice(1).join(' ') || null,
          })
          .select('id')
          .single()

        if (contactError) console.log('[gmail-pubsub] contact error:', contactError.message)
        if (contactError || !newContact) continue
        contactId = newContact.id
      }

      // Trouver ou créer la conversation
      let conversationId: string

      const { data: existingConv } = await adminSupabase
        .from('conversations')
        .select('id, unread_count')
        .eq('contact_id', contactId)
        .eq('email_session_id', session.id)
        .eq('channel', 'email')
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
        await adminSupabase
          .from('conversations')
          .update({
            last_message_at: email.receivedAt.toISOString(),
            last_message_preview: email.body.slice(0, 200),
            unread_count: (existingConv.unread_count ?? 0) + 1,
          })
          .eq('id', conversationId)
      } else {
        const { data: newConv, error: convError } = await adminSupabase
          .from('conversations')
          .insert({
            session_id: null,
            contact_id: contactId,
            channel: 'email',
            email_session_id: session.id,
            last_message_at: email.receivedAt.toISOString(),
            last_message_preview: email.body.slice(0, 200),
            unread_count: 1,
          })
          .select('id')
          .single()

        if (convError) console.log('[gmail-pubsub] conv error:', convError.message)
        if (convError || !newConv) continue
        conversationId = newConv.id
      }

      // Insérer le message
      const { error: msgError } = await adminSupabase.from('messages').insert({
        conversation_id: conversationId,
        session_id: null,
        direction: 'inbound',
        content: encryptMessage(email.body),
        message_type: 'text',
        channel_message_id: email.messageId,
        sent_by: 'contact',
        status: 'delivered',
        ai_processed: false,
        ...(email.subject ? { transcription: `Objet: ${email.subject}` } : {}),
      })
      if (msgError) console.log('[gmail-pubsub] msg error:', msgError.message)
      else console.log('[gmail-pubsub] email inserted from:', email.from)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[gmail-pubsub] catch error:', err)
    // Retourner 500 pour que Pub/Sub réessaie en cas d'erreur inattendue
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
