import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// FUSION Tags → Lifecycle : ces routes pointent désormais sur lifecycle_stages.
// L'UI inbox (qui appelle /api/tags) gère ainsi les étiquettes lifecycle sans
// changer de code. Les champs id/name/color restent compatibles.

/** GET /api/tags — Liste des étiquettes lifecycle de l'utilisateur */
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

/** POST /api/tags — Créer une nouvelle étiquette lifecycle */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, color } = body as { name?: string; color?: string }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })
  }

  // position = à la suite des étiquettes existantes
  const { data: maxRow } = await supabase
    .from('lifecycle_stages')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (maxRow?.position ?? 0) + 1

  const { data: stage, error } = await supabase
    .from('lifecycle_stages')
    .insert({
      user_id: user.id,
      name: name.trim(),
      color: color || '#6366f1',
      position: nextPosition,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Cette étiquette existe déjà' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: stage }, { status: 201 })
}
