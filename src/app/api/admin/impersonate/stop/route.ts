import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { IMPERSONATION_COOKIE } from '@/lib/admin/impersonation'

/**
 * POST /api/admin/impersonate/stop
 *
 * Termine l'impersonation : ferme la ligne de journal ET efface le cookie. Dès la
 * ligne fermée, getEffectiveUser() ignore le cookie (revalidation à chaque
 * requête) — donc l'impersonation cesse instantanément, même avant expiration.
 *
 * Volontairement tolérant : on efface le cookie même s'il n'y a pas de ligne à
 * fermer, pour qu'on puisse toujours « revenir à son compte » sans se coincer.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    await admin
      .from('admin_impersonation_log')
      .update({ ended_at: new Date().toISOString() })
      .eq('admin_id', user.id)
      .is('ended_at', null)
  }

  const cookieStore = await cookies()
  cookieStore.delete(IMPERSONATION_COOKIE)

  return NextResponse.json({ ok: true })
}
