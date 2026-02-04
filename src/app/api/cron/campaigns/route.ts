import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startCampaignExecution } from '@/lib/campaigns/executor'

/**
 * GET /api/cron/campaigns
 *
 * Endpoint cron pour lancer les campagnes programmées
 * À appeler toutes les minutes via un service comme Vercel Cron, Upstash, ou un cron système
 *
 * Configuration Vercel Cron (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/campaigns",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export async function GET(req: NextRequest) {
  // Vérifier l'autorisation (clé secrète ou header Vercel)
  const authHeader = req.headers.get('authorization')
  const vercelCronSecret = req.headers.get('x-vercel-cron-secret')
  const cronSecret = process.env.CRON_SECRET

  // Accepter soit le header Authorization, soit le header Vercel Cron
  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && vercelCronSecret === cronSecret) ||
    // En développement, autoriser sans clé
    process.env.NODE_ENV === 'development'

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const now = new Date().toISOString()

    // Récupérer les campagnes programmées dont l'heure est passée
    const { data: scheduledCampaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, scheduled_at')
      .eq('status', 'scheduled')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)

    if (error) {
      console.error('[Cron Campaigns] Error fetching campaigns:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!scheduledCampaigns || scheduledCampaigns.length === 0) {
      return NextResponse.json({
        message: 'Aucune campagne à lancer',
        checked_at: now,
      })
    }

    console.log(`[Cron Campaigns] Found ${scheduledCampaigns.length} campaigns to start`)

    const results: { id: string; name: string; status: string }[] = []

    for (const campaign of scheduledCampaigns) {
      try {
        // Vérifier qu'il y a des destinataires
        const { count } = await supabase
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')

        if ((count || 0) === 0) {
          console.log(`[Cron Campaigns] Campaign ${campaign.id} has no recipients, skipping`)
          results.push({ id: campaign.id, name: campaign.name, status: 'skipped_no_recipients' })
          continue
        }

        // Mettre à jour le statut à running
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            status: 'running',
            started_at: now,
          })
          .eq('id', campaign.id)

        if (updateError) {
          console.error(`[Cron Campaigns] Error updating campaign ${campaign.id}:`, updateError)
          results.push({ id: campaign.id, name: campaign.name, status: 'error' })
          continue
        }

        // Marquer les destinataires comme queued
        await supabase
          .from('campaign_recipients')
          .update({ status: 'queued' })
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')

        // Lancer l'exécution en arrière-plan
        startCampaignExecution(campaign.id)

        console.log(`[Cron Campaigns] Started campaign ${campaign.id}: ${campaign.name}`)
        results.push({ id: campaign.id, name: campaign.name, status: 'started' })
      } catch (err) {
        console.error(`[Cron Campaigns] Error processing campaign ${campaign.id}:`, err)
        results.push({ id: campaign.id, name: campaign.name, status: 'error' })
      }
    }

    return NextResponse.json({
      message: `${results.filter(r => r.status === 'started').length} campagne(s) démarrée(s)`,
      checked_at: now,
      results,
    })
  } catch (error) {
    console.error('[Cron Campaigns] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    )
  }
}
