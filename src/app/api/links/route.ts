import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/links — Lister les liens WA de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les liens avec les sessions associées
  const { data: links, error } = await supabase
    .from('wa_links')
    .select('*, whatsapp_sessions(phone_number, instance_name, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: links })
}

/** POST /api/links — Créer un nouveau lien WA */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, session_id, pre_filled_message, tracking_source, slug, ai_agent_id } = body as {
    name?: string
    session_id?: string
    pre_filled_message?: string
    tracking_source?: string
    slug?: string
    ai_agent_id?: string | null
  }

  if (!name || !session_id) {
    return NextResponse.json({ error: 'Nom et session requis' }, { status: 400 })
  }

  // Vérifier que la session appartient à l'utilisateur
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Générer un slug si non fourni
  const finalSlug = slug?.trim() || Math.random().toString(36).substring(2, 10)

  const { data: link, error } = await supabase
    .from('wa_links')
    .insert({
      user_id: user.id,
      session_id,
      name,
      slug: finalSlug,
      pre_filled_message: pre_filled_message || null,
      tracking_source: tracking_source || null,
      ai_agent_id: ai_agent_id || null,
    })
    .select('*, whatsapp_sessions(phone_number, instance_name, status)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: link })
}
