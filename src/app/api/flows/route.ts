import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FlowScreen } from '@/types/database'

/** GET /api/flows — liste des flows de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabase
    .from('whatsapp_flows')
    .select('id, session_id, name, cta_text, body_text, screens, meta_flow_id, status, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/flows — créer un flow (brouillon local) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, cta_text, body_text, screens } = body as {
    name?: string; cta_text?: string; body_text?: string; screens?: FlowScreen[]
  }
  if (!name?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  const { data, error } = await supabase
    .from('whatsapp_flows')
    .insert({
      user_id: user.id,
      name: name.trim(),
      cta_text: cta_text?.trim() || 'Ouvrir',
      body_text: body_text?.trim() || '',
      screens: Array.isArray(screens) ? screens : [],
      status: 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
