import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Colonnes exposables au navigateur.
 *
 * ⚠️ `waba_access_token` en est VOLONTAIREMENT absent : ce jeton Meta permet
 * d'envoyer des messages au nom du marchand. Il ne doit jamais quitter le
 * serveur. Même liste que la route de liste (`sessions/route.ts`).
 */
const SAFE_SESSION_COLUMNS =
  'id, user_id, instance_name, status, phone_number, display_name, integration_type, waba_phone_number_id, waba_business_account_id, daily_ai_message_limit, ai_message_delay, created_at, updated_at'

/** PATCH /api/sessions/[id] — Modifier les paramètres d'une session */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer la session actuelle pour vérifier l'accès
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    // ⚠️ LISTE BLANCHE — `select('*')` renvoyait `waba_access_token` au
    // NAVIGATEUR. Le jeton Meta permet d'envoyer des messages au nom du
    // marchand : il n'a rien à faire côté client, où il est exposé aux
    // extensions, aux outils de développement et à toute XSS.
    // Mêmes colonnes que la route de liste (sessions/route.ts).
    .select(SAFE_SESSION_COLUMNS)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existingSession) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const { display_name, daily_ai_message_limit, ai_message_delay } = body as {
    display_name?: string | null
    daily_ai_message_limit?: number | null
    ai_message_delay?: number | null
  }

  const updateData: Record<string, unknown> = {}

  // Gestion du nom d'affichage
  if (display_name !== undefined) {
    updateData.display_name = display_name?.trim() || null
  }

  // Gestion de la limite quotidienne
  if (daily_ai_message_limit !== undefined) {
    updateData.daily_ai_message_limit = daily_ai_message_limit != null
      ? Math.max(1, Math.min(100000, Math.floor(daily_ai_message_limit)))
      : null
  }

  // Gestion du délai entre envois automatiques
  if (ai_message_delay !== undefined) {
    updateData.ai_message_delay = ai_message_delay != null
      ? Math.max(1, Math.min(60, Math.floor(ai_message_delay)))
      : null
  }

  // Mise à jour si nécessaire
  let session = existingSession
  if (Object.keys(updateData).length > 0) {
    const { data: updatedSession, error } = await supabase
      .from('whatsapp_sessions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(SAFE_SESSION_COLUMNS)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    session = updatedSession
  }

  return NextResponse.json({ data: session })
}
