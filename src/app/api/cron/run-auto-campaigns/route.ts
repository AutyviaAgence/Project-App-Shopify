import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { startCampaignExecution } from '@/lib/campaigns/executor'

/**
 * Cron — exécute les campagnes automatiques dont le déclencheur est satisfait.
 *
 * V1 : gère les déclencheurs autonomes (planifiables) :
 *   - scheduled  : scheduled_at atteint
 *   - inactivity : relance périodique (l'executor filtre par inactivité)
 *
 * Les déclencheurs événementiels (shopify_event, tag) sont gérés par les
 * webhooks correspondants, pas ici.
 *
 * À appeler périodiquement (ex : toutes les 15 min) avec le header
 * Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getAdminSupabase()

  const nowIso = new Date().toISOString()

  // Campagnes auto actives, pas déjà en cours/terminées
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, trigger_type, scheduled_at, status, is_active, campaign_mode')
    .eq('campaign_mode', 'auto')
    .eq('is_active', true)
    .in('status', ['draft', 'scheduled', 'paused'])

  const started: string[] = []

  for (const c of campaigns || []) {
    let shouldRun = false

    if (c.trigger_type === 'scheduled') {
      // Lancer si la date planifiée est atteinte
      shouldRun = !!c.scheduled_at && c.scheduled_at <= nowIso
    } else if (c.trigger_type === 'inactivity') {
      // Relance périodique : l'executor sélectionne les contacts inactifs
      // selon filter_inactivity_days. On la relance à chaque tick si active.
      shouldRun = true
    }

    if (shouldRun) {
      await supabase.from('campaigns').update({ status: 'running', started_at: nowIso }).eq('id', c.id)
      startCampaignExecution(c.id)
      started.push(c.id)
    }
  }

  return NextResponse.json({ ok: true, started: started.length })
}
