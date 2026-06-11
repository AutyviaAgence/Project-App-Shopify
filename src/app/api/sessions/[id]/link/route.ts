import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/sessions/[id]/link — Récupère le lien WA de la session.
 * S'il n'existe pas, le crée à la volée puis le retourne.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que la session appartient à l'utilisateur
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Lien existant ?
  const { data: existing } = await supabase
    .from('wa_links')
    .select('*, whatsapp_sessions(phone_number, instance_name, status)')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ data: existing })
  }

  // Création à la volée
  const { data: link, error } = await supabase
    .from('wa_links')
    .insert({
      user_id: user.id,
      session_id: sessionId,
      name: 'Lien WhatsApp',
      slug: randomBytes(6).toString('base64url'),
      pre_filled_message: 'Bonjour, je viens de votre boutique !',
      is_active: true,
      ai_agent_id: null,
    })
    .select('*, whatsapp_sessions(phone_number, instance_name, status)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: link })
}
