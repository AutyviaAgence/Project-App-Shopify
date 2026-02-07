import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'

/** GET /api/sessions/[id]/qr — Récupérer un nouveau QR code ou pairing code */
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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Déterminer si c'est une session pairing code
  const isPairingCode = !!session.pairing_code

  if (isPairingCode) {
    const phoneNumber = session.phone_number
    if (!phoneNumber) {
      return NextResponse.json({ error: 'Numéro manquant pour le code de jumelage' }, { status: 400 })
    }

    const evoResult = await evolution.getConnectionCode(session.instance_name, phoneNumber)
    if (!evoResult.ok) {
      return NextResponse.json({ error: evoResult.error }, { status: 502 })
    }

    const data = evoResult.data as Record<string, unknown>
    const pairingCode = (data?.pairingCode as string) || null
    const base64 = (data?.base64 as string) || null

    if (pairingCode) {
      await supabase
        .from('whatsapp_sessions')
        .update({ pairing_code: pairingCode, status: 'qr_pending' as const })
        .eq('id', id)
    }

    return NextResponse.json({ data: { pairing_code: pairingCode, qr_code: base64 } })
  }

  // QR code classique
  const evoResult = await evolution.getQRCode(session.instance_name)

  if (!evoResult.ok) {
    return NextResponse.json({ error: evoResult.error }, { status: 502 })
  }

  const data = evoResult.data as Record<string, unknown>
  const base64 = (data?.base64 as string) || null

  if (base64) {
    await supabase
      .from('whatsapp_sessions')
      .update({ qr_code: base64, status: 'qr_pending' as const })
      .eq('id', id)
  }

  return NextResponse.json({ data: { qr_code: base64 } })
}
