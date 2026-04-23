import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('onboarding_configs')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }

  return NextResponse.json({ data: data || null })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { main_function, behavior, tools, escalation, languages, conversation_example, info_to_collect, cgv_accepted } = body

  if (!main_function || !behavior || !tools?.length || !escalation || !languages?.length || !conversation_example?.trim() || !info_to_collect?.trim()) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  if (!cgv_accepted) {
    return NextResponse.json({ error: 'Vous devez accepter les CGV/CGU.' }, { status: 400 })
  }

  const payload = {
    user_id: user.id,
    main_function,
    behavior,
    tools,
    escalation,
    languages,
    conversation_example: conversation_example.trim(),
    info_to_collect: info_to_collect.trim(),
    cgv_accepted_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('onboarding_configs')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    console.error('[Onboarding Config] Error:', error)
    return NextResponse.json({ error: error.message || 'Erreur lors de la sauvegarde' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
