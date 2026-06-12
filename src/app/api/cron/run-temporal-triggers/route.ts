import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
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
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { queued } = await runTemporalTriggers(supabase)
  return NextResponse.json({ ok: true, queued })
}
