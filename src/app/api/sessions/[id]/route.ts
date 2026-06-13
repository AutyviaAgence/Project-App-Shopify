import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existingSession) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const { display_name, daily_ai_message_limit, ai_message_delay, waba_catalog_id } = body as {
    display_name?: string | null
    daily_ai_message_limit?: number | null
    ai_message_delay?: number | null
    waba_catalog_id?: string | null
  }

  const updateData: Record<string, unknown> = {}

  // Catalogue Meta (Multi-Product Message)
  if (waba_catalog_id !== undefined) {
    updateData.waba_catalog_id = waba_catalog_id?.trim() || null
  }

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
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    session = updatedSession
  }

  return NextResponse.json({ data: session })
}
