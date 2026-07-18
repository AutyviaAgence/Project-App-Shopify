import { NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/admin/impersonation'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * GET /api/admin/impersonate/status
 *
 * Dit à la bannière si une impersonation est active, et pour qui (email de la
 * cible, pour l'afficher). Se fie à getEffectiveUser (validé en base) — un cookie
 * seul ne suffit pas à déclencher la bannière.
 */
export async function GET() {
  const eff = await getEffectiveUser()
  if (!eff?.isImpersonating) {
    return NextResponse.json({ isImpersonating: false })
  }

  // Email de la cible pour l'afficher dans la bannière.
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: prof } = await admin
    .from('profiles').select('email').eq('id', eff.id).maybeSingle() as { data: { email: string | null } | null }

  return NextResponse.json({ isImpersonating: true, targetEmail: prof?.email || null })
}
