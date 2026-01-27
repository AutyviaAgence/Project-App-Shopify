import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'

/** POST /api/sessions/[id]/webhook — Reconfigurer le webhook d'une session */
export async function POST(
  req: NextRequest,
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

  // Lire l'URL du webhook depuis le body ou utiliser le défaut
  const body = await req.json().catch(() => ({}))
  const webhookUrl = body.webhookUrl as string | undefined
  const appUrl = webhookUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const fullUrl = webhookUrl || `${appUrl}/api/webhook/evolution`

  const result = await evolution.setWebhook(session.instance_name, fullUrl)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ data: { webhook: fullUrl } })
}
