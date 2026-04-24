import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { evolution } from '@/lib/evolution/client'

// Appel léger pour tester si une session Baileys répond vraiment
async function isSessionAlive(instanceName: string): Promise<boolean> {
  const result = await evolution.findMessages(instanceName, 'health@s.whatsapp.net', { limit: 1 })
  // Si "Connection Closed" → zombie (handleZombieSession est déjà appelé dans findMessages)
  if (!result.ok && result.error.toLowerCase().includes('connection closed')) {
    return false
  }
  return true
}

/** GET /api/cron/check-sessions — Vérifie toutes les sessions Evolution et détecte les zombies */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Récupérer toutes les sessions Evolution marquées comme connectées
  const { data: sessions, error } = await admin
    .from('whatsapp_sessions')
    .select('id, instance_name, user_id')
    .eq('status', 'connected')
    .eq('integration_type', 'evolution')

  if (error || !sessions) {
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const results = {
    checked: sessions.length,
    alive: 0,
    zombies: [] as string[],
  }

  // Tester chaque session en séquentiel pour ne pas surcharger Evolution API
  for (const session of sessions) {
    const alive = await isSessionAlive(session.instance_name)
    if (alive) {
      results.alive++
    } else {
      results.zombies.push(session.instance_name)
      // handleZombieSession est déjà appelé dans findMessages — juste logger ici
      console.warn(`[Cron] Zombie session detected: ${session.instance_name} (user: ${session.user_id})`)
    }
    // Petite pause pour ne pas spammer Evolution API
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`[Cron] check-sessions: ${results.checked} checked, ${results.alive} alive, ${results.zombies.length} zombies`)
  return NextResponse.json(results)
}
