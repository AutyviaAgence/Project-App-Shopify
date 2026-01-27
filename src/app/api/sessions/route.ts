import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'

/** POST /api/sessions — Créer une nouvelle session WhatsApp */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const instanceName = `wa-${user.id.slice(0, 8)}-${Date.now()}`

  // 1. Créer l'instance sur Evolution API
  const evoResult = await evolution.createInstance(instanceName)
  if (!evoResult.ok) {
    return NextResponse.json({ error: evoResult.error }, { status: 502 })
  }

  // 2. Configurer le webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await evolution.setWebhook(instanceName, `${appUrl}/api/webhook/evolution`)

  // 3. Sauvegarder en BDD
  const evoData = evoResult.data as Record<string, unknown>
  const qrcode = evoData?.qrcode as { base64?: string } | undefined

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .insert({
      user_id: user.id,
      instance_name: instanceName,
      instance_id: (evoData?.instance as Record<string, unknown>)?.instanceId as string || null,
      status: 'qr_pending' as const,
      qr_code: qrcode?.base64 || null,
    })
    .select()
    .single()

  if (dbError) {
    // Nettoyer l'instance Evolution si la BDD échoue
    await evolution.deleteInstance(instanceName)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ data: session })
}

/** GET /api/sessions — Lister les sessions de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: sessions, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: sessions })
}
