import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'

/** POST /api/sessions/[id]/disconnect — Déconnecter une session */
export async function POST(
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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Déconnecter sur Evolution API (seulement pour les sessions Evolution)
  if (session.integration_type !== 'waba') {
    // Baileys stores credentials locally and auto-reconnects after logout/restart.
    // The only reliable way to force a full re-scan is to DELETE and RECREATE the instance
    // on Evolution API — this clears the Baileys session keys.
    // We keep all DB data (conversations, messages) intact.
    await evolution.disconnect(session.instance_name).catch(() => {}) // best effort
    await new Promise(resolve => setTimeout(resolve, 500))
    await evolution.deleteInstance(session.instance_name).catch(() => {}) // best effort
    await new Promise(resolve => setTimeout(resolve, 500))

    // Recreate the instance with the same name so webhooks still work
    const evoResult = await evolution.createInstance(
      session.instance_name,
      session.phone_number && session.pairing_code ? session.phone_number : undefined
    )

    // Re-configure webhook
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET
    const secretParam = webhookSecret ? `?secret=${webhookSecret}` : ''
    if (appUrl) {
      await evolution.setWebhook(session.instance_name, `${appUrl}/api/webhook/evolution${secretParam}`).catch(() => {})
    }

    // Extract QR code from createInstance response
    const evoData = evoResult.ok ? (evoResult.data as Record<string, unknown>) : null
    const qrcode = evoData?.qrcode as { base64?: string; pairingCode?: string } | undefined
    const newQrCode = qrcode?.base64 || null

    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'qr_pending', qr_code: newQrCode, pairing_code: null })
      .eq('id', id)

    return NextResponse.json({ data: { status: 'qr_pending', qr_code: newQrCode } })
  }

  // WABA: just mark disconnected
  await supabase
    .from('whatsapp_sessions')
    .update({ status: 'disconnected', qr_code: null, pairing_code: null })
    .eq('id', id)

  return NextResponse.json({ data: { status: 'disconnected' } })
}

/** DELETE /api/sessions/[id]/disconnect — Supprimer une session */
export async function DELETE(
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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Supprimer sur Evolution API (seulement pour les sessions Evolution)
  if (session.integration_type !== 'waba') {
    await evolution.disconnect(session.instance_name)
    await evolution.deleteInstance(session.instance_name)
  }

  // Supprimer en BDD (CASCADE supprime contacts, conversations, messages)
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('id', id)

  return NextResponse.json({ data: { deleted: true } })
}
