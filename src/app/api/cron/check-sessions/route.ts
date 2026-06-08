import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/check-sessions — No-op depuis le passage en WABA only.
 *
 * Cette route servait à détecter les sessions "zombies" d'Evolution API
 * (Baileys). WABA (WhatsApp Cloud API) n'a pas ce problème : pas de socket
 * persistant à surveiller. Conservée en no-op pour ne pas casser un cron
 * existant ; peut être retirée une fois le cron supprimé côté infra.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ checked: 0, alive: 0, zombies: [], note: 'WABA only — no-op' })
}
