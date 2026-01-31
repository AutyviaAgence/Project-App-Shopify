import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'
import { syncContactsFromWhatsApp } from '@/lib/evolution/sync-contacts'

/** POST /api/sessions/[id]/sync-contacts — Synchroniser les contacts WhatsApp */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer la session
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Vérifier l'accès à la session
  const hasAccess = await canAccessResource(supabase, user.id, session.user_id, session.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier que la session est connectée
  if (session.status !== 'connected') {
    return NextResponse.json(
      { error: 'La session doit être connectée pour synchroniser les contacts' },
      { status: 400 }
    )
  }

  // Lancer la synchronisation
  const result = await syncContactsFromWhatsApp(supabase, session.id, session.instance_name)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Erreur lors de la synchronisation' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: {
      synced: result.synced,
      skipped: result.skipped,
    }
  })
}
