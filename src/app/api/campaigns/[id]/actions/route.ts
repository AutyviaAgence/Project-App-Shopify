import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startCampaignExecution } from '@/lib/campaigns/executor'

type CampaignAction = 'start' | 'pause' | 'resume' | 'cancel'

/** POST /api/campaigns/[id]/actions — Exécuter une action sur la campagne */
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

  const body = await req.json()
  const { action, reason } = body as { action: CampaignAction; reason?: string }

  // Valider l'action
  const validActions: CampaignAction[] = ['start', 'pause', 'resume', 'cancel']
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: 'Action invalide. Valeurs acceptées: start, pause, resume, cancel' },
      { status: 400 }
    )
  }

  // Récupérer la campagne
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier que l'utilisateur est le propriétaire
  if (campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Valider la transition de statut
  const transitions: Record<CampaignAction, { from: string[]; to: string }> = {
    start: { from: ['draft', 'scheduled'], to: 'running' },
    pause: { from: ['running'], to: 'paused' },
    resume: { from: ['paused'], to: 'running' },
    cancel: { from: ['draft', 'scheduled', 'running', 'paused'], to: 'cancelled' },
  }

  const transition = transitions[action]
  if (!transition.from.includes(campaign.status)) {
    return NextResponse.json(
      {
        error: `Impossible de ${action} une campagne en statut "${campaign.status}". Statuts valides: ${transition.from.join(', ')}`,
      },
      { status: 400 }
    )
  }

  // Vérifier qu'il y a des destinataires pour démarrer
  if (action === 'start' || action === 'resume') {
    const { count } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .eq('status', 'pending')

    if ((count || 0) === 0 && action === 'start') {
      return NextResponse.json(
        { error: 'Aucun destinataire en attente. Utilisez /preview pour ajouter des contacts.' },
        { status: 400 }
      )
    }
  }

  // Préparer les données de mise à jour
  const updateData: Record<string, unknown> = {
    status: transition.to,
  }

  switch (action) {
    case 'start':
      updateData.started_at = new Date().toISOString()
      break
    case 'pause':
      updateData.paused_at = new Date().toISOString()
      updateData.pause_reason = reason || 'Mise en pause manuelle'
      break
    case 'resume':
      updateData.paused_at = null
      updateData.pause_reason = null
      break
    case 'cancel':
      updateData.completed_at = new Date().toISOString()
      updateData.pause_reason = reason || 'Annulée manuellement'
      break
  }

  // Mettre à jour la campagne
  const { data: updatedCampaign, error } = await supabase
    .from('campaigns')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Si démarrage, marquer les destinataires comme "queued" et lancer l'exécution
  if (action === 'start' || action === 'resume') {
    await supabase
      .from('campaign_recipients')
      .update({ status: 'queued' })
      .eq('campaign_id', id)
      .eq('status', 'pending')

    // Lancer l'exécution en arrière-plan (fire & forget, pas de requête HTTP)
    startCampaignExecution(id)
  }

  // Si annulation, marquer les destinataires pending/queued comme "skipped"
  if (action === 'cancel') {
    await supabase
      .from('campaign_recipients')
      .update({ status: 'skipped' })
      .eq('campaign_id', id)
      .in('status', ['pending', 'queued', 'sending'])
  }

  return NextResponse.json({
    data: updatedCampaign,
    message: getActionMessage(action),
  })
}

function getActionMessage(action: CampaignAction): string {
  switch (action) {
    case 'start':
      return 'Campagne démarrée. Les messages seront envoyés progressivement.'
    case 'pause':
      return 'Campagne mise en pause. Les envois sont suspendus.'
    case 'resume':
      return 'Campagne reprise. Les envois continuent.'
    case 'cancel':
      return 'Campagne annulée. Les envois en attente ont été annulés.'
  }
}
