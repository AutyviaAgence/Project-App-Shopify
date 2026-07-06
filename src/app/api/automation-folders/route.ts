import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/automation-folders — Dossiers de workflows de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('automation_folders')
    .select('*')
    .eq('user_id', user.id)
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/automation-folders — Créer un dossier */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { name, color } = (await req.json()) as { name?: string; color?: string }
  if (!name?.trim()) return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: last } = await (supabase as any)
    .from('automation_folders')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const pos = (last?.position ?? -1) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('automation_folders')
    .insert({ user_id: user.id, name: name.trim(), color: color || '#6366f1', position: pos })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

/** PUT /api/automation-folders — Réordonner les dossiers { order: string[] } */
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { order } = (await req.json()) as { order?: string[] }
  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order[] requis' }, { status: 400 })
  }

  await Promise.all(order.map((id, index) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('automation_folders').update({ position: index }).eq('id', id).eq('user_id', user.id)
  ))
  return NextResponse.json({ success: true })
}
