import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/lifecycle/stages — Liste des stages de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: stages, error } = await supabase
    .from('lifecycle_stages')
    .select('*')
    .eq('user_id', user.id)
    .order('position')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: stages })
}

/** POST /api/lifecycle/stages — Créer un nouveau stage */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, color, icon, description, position } = body as {
    name?: string
    color?: string
    icon?: string
    description?: string
    position?: number
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })
  }

  // Si pas de position, mettre à la fin
  let pos = position
  if (pos === undefined) {
    const { data: last } = await supabase
      .from('lifecycle_stages')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1)
      .single()
    pos = (last?.position ?? -1) + 1
  }

  const { data: stage, error } = await supabase
    .from('lifecycle_stages')
    .insert({
      user_id: user.id,
      name: name.trim(),
      color: color || '#6366f1',
      icon: icon || null,
      description: description || null,
      position: pos,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce stage existe déjà' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: stage }, { status: 201 })
}

/** PUT /api/lifecycle/stages — Réordonner les stages */
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { order } = body as { order?: string[] }

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order[] requis' }, { status: 400 })
  }

  // Mettre à jour les positions
  const updates = order.map((id, index) =>
    supabase
      .from('lifecycle_stages')
      .update({ position: index })
      .eq('id', id)
      .eq('user_id', user.id)
  )

  await Promise.all(updates)

  return NextResponse.json({ success: true })
}
