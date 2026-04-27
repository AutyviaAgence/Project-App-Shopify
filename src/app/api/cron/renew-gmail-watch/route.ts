import { NextRequest, NextResponse } from 'next/server'

/** GET /api/cron/renew-gmail-watch
 * Renouvelle le Gmail Watch sur toutes les sessions Gmail connectées.
 * Gmail Watch expire après 7 jours — à appeler au moins une fois par semaine.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${appUrl}/api/email-sessions/watch`, { method: 'POST' })
  const data = await res.json()

  return NextResponse.json({ ok: true, ...data })
}
