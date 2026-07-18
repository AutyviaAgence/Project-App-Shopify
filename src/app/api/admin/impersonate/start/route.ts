import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { IMPERSONATION_COOKIE } from '@/lib/admin/impersonation'

/**
 * POST /api/admin/impersonate/start  { target_user_id }
 *
 * Démarre une session d'impersonation : ouvre une ligne de journal (service_role)
 * et pose le cookie. À partir de là, getEffectiveUser() renvoie la cible tant que
 * la ligne reste ouverte.
 *
 * Gardes (toutes vérifiées ICI, côté serveur — le clic ne suffit pas) :
 *  - l'appelant est admin ;
 *  - la cible existe et n'est PAS elle-même admin (on n'impersonne pas un pair) ;
 *  - pas d'auto-impersonation.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle() as { data: { role: string | null } | null }
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const targetId = String(body.target_user_id || '').trim()
  if (!targetId) return NextResponse.json({ error: 'target_user_id requis' }, { status: 400 })
  if (targetId === user.id) return NextResponse.json({ error: 'Impossible de s’impersonner soi-même.' }, { status: 400 })

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // La cible existe-t-elle ? Est-elle admin ? (on n'impersonne pas un autre admin.)
  const { data: target } = await admin
    .from('profiles').select('id, role').eq('id', targetId).maybeSingle() as { data: { id: string; role: string | null } | null }
  if (!target) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  if (target.role === 'admin') return NextResponse.json({ error: 'Impossible d’impersonner un autre admin.' }, { status: 403 })

  // Fermer une éventuelle session encore ouverte de cet admin (une seule à la fois).
  await admin
    .from('admin_impersonation_log')
    .update({ ended_at: new Date().toISOString() })
    .eq('admin_id', user.id)
    .is('ended_at', null)

  // Ouvrir la nouvelle session de journal — c'est ELLE qui autorise le cookie.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const ua = req.headers.get('user-agent')?.slice(0, 300) || null
  const { error: logErr } = await admin.from('admin_impersonation_log').insert({
    admin_id: user.id, target_user_id: targetId, ip, user_agent: ua,
  })
  if (logErr) {
    console.error('[impersonate/start] journal:', logErr.message)
    return NextResponse.json({ error: 'Impossible de démarrer l’impersonation.' }, { status: 500 })
  }

  // Cookie httpOnly : jamais lisible en JS client, transmis à chaque requête.
  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, targetId, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 8, // 8 h — filet de sécurité si « stop » n'est jamais cliqué.
  })

  return NextResponse.json({ ok: true, target_user_id: targetId })
}
