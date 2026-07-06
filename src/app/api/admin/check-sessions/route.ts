import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/check-sessions — Vérification des sessions "zombies" (admin).
 *
 * Remplace l'appel client au cron `check-sessions` qui exposait le CRON_SECRET
 * dans le bundle navigateur (faille). Ici l'accès est protégé par la session
 * admin (aucun secret côté client). Le check est un no-op depuis le passage en
 * WABA (pas de socket persistant à surveiller).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // WABA only → pas de sessions zombies à détecter.
  return NextResponse.json({ checked: 0, alive: 0, zombies: [], note: 'WABA only — no-op' })
}
