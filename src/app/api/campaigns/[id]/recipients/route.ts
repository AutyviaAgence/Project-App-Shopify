import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** DELETE /api/campaigns/[id]/recipients — Supprimer des destinataires */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Parse body
  const body = await req.json()
  const recipientIds: string[] = body.recipient_ids

  if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json(
      { error: 'recipient_ids requis (tableau de UUIDs)' },
      { status: 400 }
    )
  }

  // Récupérer la campagne
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, user_id, status')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  // Vérifier l'accès (propriétaire uniquement)
  if (campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier que la campagne est en brouillon ou programmée
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return NextResponse.json(
      { error: 'Impossible de modifier les destinataires d\'une campagne active' },
      { status: 400 }
    )
  }

  // Supprimer les destinataires
  const { error: deleteError, count } = await supabase
    .from('campaign_recipients')
    .delete()
    .eq('campaign_id', id)
    .in('id', recipientIds)

  if (deleteError) {
    console.error('Erreur suppression destinataires:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Mettre à jour le compteur total
  const { count: remainingCount } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)

  await supabase
    .from('campaigns')
    .update({ total_recipients: remainingCount || 0 })
    .eq('id', id)

  return NextResponse.json({
    data: {
      deleted_count: count || 0,
      remaining_count: remainingCount || 0,
    },
  })
}
