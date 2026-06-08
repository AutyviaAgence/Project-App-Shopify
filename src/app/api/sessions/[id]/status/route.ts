import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/** Strip sensitive fields before sending session data to client */
function sanitizeSession(session: Record<string, unknown>) {
  const { waba_access_token, ...safe } = session
  return safe
}

/** GET /api/sessions/[id]/status — Vérifier le status d'une session WABA */
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

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id, instance_name, status, phone_number, display_name, integration_type, waba_phone_number_id, waba_business_account_id, waba_access_token, daily_ai_message_limit, ai_message_delay, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // WABA : vérifier le token en appelant Meta Graph API
  try {
    const decryptedToken = session.waba_access_token ? decryptMessage(session.waba_access_token) : ''
    const phoneInfo = await wabaClient.getPhoneNumber(
      session.waba_phone_number_id!,
      decryptedToken
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
