import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedMediaUrl } from '@/lib/storage/media'

/** GET /api/media/[messageId] — Retourne une URL signée pour le média d'un message */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le message
  const { data: message } = await supabase
    .from('messages')
    .select('media_url, media_mime_type, session_id')
    .eq('id', messageId)
    .single()

  if (!message?.media_url) {
    return NextResponse.json({ error: 'Média introuvable' }, { status: 404 })
  }

  // Vérifier l'accès à la session (propriétaire uniquement)
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id')
    .eq('id', message.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const signedUrl = await getSignedMediaUrl(message.media_url, 3600)
  if (!signedUrl) {
    return NextResponse.json({ error: 'Impossible de générer le lien' }, { status: 500 })
  }

  return NextResponse.json({
    url: signedUrl,
    mimeType: message.media_mime_type,
  })
}
