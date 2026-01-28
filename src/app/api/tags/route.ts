import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/tags — Liste des tags de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: tags, error } = await supabase
    .from('conversation_tags')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: tags })
}

/** POST /api/tags — Créer un nouveau tag */
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

  const { data: tag, error } = await supabase
    .from('conversation_tags')
    .insert({
      user_id: user.id,
      name: name.trim(),
      color: color || '#6366f1',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce tag existe déjà' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: tag }, { status: 201 })
}
