import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { PLAN_TOKEN_LIMITS, resolvePlan } from '@/lib/stripe/plans'

/**
 * POST /api/admin/client-actions — actions admin sur un compte client.
 *
 * Actions :
 *  - set_tokens : { tokens_limit?, tokens_extra?, reset_used? } — ajuste les
 *    quotas ; reset_used remet la consommation du mois à zéro.
 *  - ban / unban : bannit le compte côté GoTrue (connexion refusée). Le ban
 *    est long (100 000 h) ; unban lève l'interdiction.
 *  - pause : suspend l'accès payant (subscription_status='past_due',
 *    tokens_limit=0 — même sémantique que l'expiration d'abonnement).
 *  - resume : réactive (status='active', tokens du plan restaurés).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string | null } | null }
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { user_id, action } = body as { user_id?: string; action?: string }
  if (!user_id || !action) return NextResponse.json({ error: 'user_id et action requis' }, { status: 400 })
  // Garde-fou : ne pas se bannir/pauser soi-même par mégarde.
  if (user_id === user.id && action !== 'set_tokens') {
    return NextResponse.json({ error: 'Action impossible sur votre propre compte' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (action === 'set_tokens') {
    const { tokens_limit, tokens_extra, reset_used } = body as {
      tokens_limit?: number; tokens_extra?: number; reset_used?: boolean
    }
    const update: Record<string, unknown> = {}
    if (typeof tokens_limit === 'number' && tokens_limit >= 0) update.tokens_limit = Math.floor(tokens_limit)
    if (typeof tokens_extra === 'number' && tokens_extra >= 0) update.tokens_extra = Math.floor(tokens_extra)
    if (reset_used === true) update.tokens_used = 0
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucune valeur à mettre à jour' }, { status: 400 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('profiles').update(update).eq('id', user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { ok: true, update } })
  }

  if (action === 'ban' || action === 'unban') {
    const { error } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: action === 'ban' ? '100000h' : 'none',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { ok: true, banned: action === 'ban' } })
  }

  if (action === 'pause' || action === 'resume') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: target } = await (admin as any)
      .from('profiles').select('plan').eq('id', user_id).maybeSingle()
    const update: Record<string, unknown> =
      action === 'pause'
        ? { subscription_status: 'past_due', tokens_limit: 0 }
        : {
            subscription_status: 'active',
            tokens_limit: PLAN_TOKEN_LIMITS[resolvePlan(target?.plan)] ?? 0,
          }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('profiles').update(update).eq('id', user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { ok: true, paused: action === 'pause' } })
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
}
