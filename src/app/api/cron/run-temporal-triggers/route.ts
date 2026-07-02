import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { runTemporalTriggers } from '@/lib/automations/temporal'

/**
 * Cron — déclencheurs temporels (pas de réponse / date / anniversaire).
 * Endpoint dédié optionnel : run-automations les déclenche déjà, donc UN SEUL
 * schedule suffit. Conservé pour pouvoir les lancer séparément si besoin.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const supabase = getAdminSupabase()
  const { queued } = await runTemporalTriggers(supabase)
  return NextResponse.json({ ok: true, queued })
}
