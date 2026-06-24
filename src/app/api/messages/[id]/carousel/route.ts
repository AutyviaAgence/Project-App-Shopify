import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedMediaUrl } from '@/lib/storage/media'

/**
 * GET /api/messages/[id]/carousel
 * Renvoie les cartes d'un message carrousel (body + titres + URLs signées des
 * images d'en-tête) pour un rendu façon WhatsApp dans l'inbox.
 *
 * Les cartes sont stockées dans `transcription` (JSON : { body, cards:[{body,header}] }).
 * Pour chaque carte ayant un `header` (storage path bucket media), on génère une
 * URL signée temporaire afin d'afficher la vraie image.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: msg } = await supabase
    .from('messages')
    .select('transcription, session_id')
    .eq('id', id)
    .maybeSingle()
  if (!msg) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })

  // Vérifier que la session appartient bien à l'utilisateur (sécurité).
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('user_id')
    .eq('id', msg.session_id)
    .maybeSingle()
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  let parsed: { body?: string; cards?: { body?: string; header?: string | null }[] } = {}
  try { parsed = JSON.parse(msg.transcription || '{}') } catch { /* vide */ }

  const cards = Array.isArray(parsed.cards) ? parsed.cards : []
  const out = await Promise.all(cards.map(async (c) => ({
    body: c.body || '',
    image: c.header ? await getSignedMediaUrl(c.header, 3600) : null,
  })))

  return NextResponse.json({ data: { body: parsed.body || '', cards: out } })
}
