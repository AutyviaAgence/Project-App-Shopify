import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'
import { wabaClient } from '@/lib/whatsapp-cloud/client'

/** Strip sensitive fields before sending session data to client */
function sanitizeSession(session: Record<string, unknown>) {
  const { waba_access_token, ...safe } = session
  return safe
}

/** GET /api/sessions/[id]/status — Vérifier le status d'une session */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer la session (sans exposer waba_access_token dans la réponse)
  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id, instance_name, instance_id, status, phone_number, display_name, qr_code, pairing_code, integration_type, waba_phone_number_id, waba_business_account_id, waba_access_token, daily_ai_message_limit, ai_message_delay, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // WABA : vérifier le token en appelant Meta Graph API
  if (session.integration_type === 'waba') {
    try {
      const phoneInfo = await wabaClient.getPhoneNumber(
        session.waba_phone_number_id!,
        session.waba_access_token!
      )
      const newStatus = phoneInfo.ok ? 'connected' : 'disconnected'
      if (newStatus !== session.status) {
        const updateData: Record<string, unknown> = { status: newStatus }
        if (phoneInfo.ok) {
          const data = phoneInfo.data as Record<string, unknown>
          if (data.display_phone_number) {
            updateData.phone_number = (data.display_phone_number as string).replace(/[^0-9]/g, '')
          }
        }
        await supabase
          .from('whatsapp_sessions')
          .update(updateData)
          .eq('id', id)
        return NextResponse.json({ data: sanitizeSession({ ...session, ...updateData }) })
      }
      return NextResponse.json({ data: sanitizeSession(session) })
    } catch {
      return NextResponse.json({ data: sanitizeSession(session) })
    }
  }

  // Evolution : vérifier le status sur Evolution API
  const evoResult = await evolution.getConnectionState(session.instance_name)

  if (!evoResult.ok) {
    console.warn('[Status] Evolution API error:', evoResult.error)
    return NextResponse.json({ data: sanitizeSession(session) })
  }

  // Evolution API peut renvoyer différentes structures selon la version
  const evoData = evoResult.data as Record<string, unknown>
  console.log('[Status] Evolution response:', JSON.stringify(evoData))

  // Chercher le state dans les structures possibles
  const state =
    (evoData?.instance as Record<string, unknown>)?.state as string
    || evoData?.state as string
    || null

  let newStatus: 'connected' | 'disconnected' | 'qr_pending' | 'error' = session.status as 'connected' | 'disconnected' | 'qr_pending' | 'error'

  if (state === 'open') newStatus = 'connected'
  else if (state === 'close') newStatus = 'disconnected'
  else if (state === 'connecting') newStatus = 'qr_pending'

  // Récupérer le numéro de téléphone si manquant
  const needsPhoneNumber = newStatus === 'connected' && !session.phone_number
  let phoneUpdate: Record<string, unknown> = {}
  if (needsPhoneNumber) {
    const instanceResult = await evolution.fetchInstance(session.instance_name)
    if (instanceResult.ok) {
      const instances = instanceResult.data as Array<Record<string, unknown>>
      const instance = Array.isArray(instances) ? instances[0] : instances
      const owner = (instance as Record<string, unknown>)?.ownerJid as string | undefined
      if (owner) {
        phoneUpdate = { phone_number: owner.split('@')[0] }
      }
    }
  }

  // Mettre à jour si changement de status ou numéro manquant
  const hasChanges = newStatus !== session.status || Object.keys(phoneUpdate).length > 0
  if (hasChanges) {
    const updateData: Record<string, unknown> = { status: newStatus, ...phoneUpdate }
    if (newStatus === 'connected') {
      updateData.qr_code = null
      updateData.pairing_code = null

      // Auto-configure webhook when session becomes connected
      if (newStatus !== session.status) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (appUrl) {
          const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhook/evolution`
          const webhookResult = await evolution.setWebhook(session.instance_name, webhookUrl)
          if (webhookResult.ok) {
            console.log(`[Status] Webhook auto-configured: ${webhookUrl}`)
          } else {
            console.warn('[Status] Failed to auto-configure webhook:', webhookResult.error)
          }
        }
      }
    }

    await supabase
      .from('whatsapp_sessions')
      .update(updateData)
      .eq('id', id)

    return NextResponse.json({ data: sanitizeSession({ ...session, ...updateData }) })
  }

  return NextResponse.json({ data: sanitizeSession(session) })
}
