import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPlanQuota } from '@/lib/plan-quota'

/** GET /api/automations — liste des automatisations. `?kind=marketing|transactional`
 *  filtre par onglet (Campagnes vs Automatisations) ; absent = tout. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const kind = new URL(req.url).searchParams.get('kind')
  const run = (withKind: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('automations')
      .select(`id, name, trigger_event, trigger_button_text, template_id, delay_minutes, quiet_start, quiet_end, timezone, conditions, is_active, graph, builder_mode, folder_id${withKind ? ', kind' : ''}, created_at, updated_at`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (withKind && (kind === 'marketing' || kind === 'transactional')) q = q.eq('kind', kind)
    return q
  }

  let { data, error } = await run(true)
  // RÉSILIENCE : si la migration `kind` n'est pas encore appliquée (déploiement
  // avant DDL), PostgREST renvoie 42703 → on rejoue sans la colonne.
  if (error && (error.code === '42703' || /kind/.test(error.message || ''))) {
    ({ data, error } = await run(false))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/automations — créer une automatisation */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body.name?.trim() || !body.trigger_event) {
    return NextResponse.json({ error: 'Nom et événement requis' }, { status: 400 })
  }

  // ── QUOTA D'AUTOMATISATIONS (15 / 50 / 200 selon le plan) ─────────────────
  //
  // C'est le NOMBRE de scénarios qui est limité, pas le volume d'envois :
  // chaque automatisation peut envoyer autant de messages que voulu. Campagnes
  // et transactionnelles partagent le même compteur (même table), conformément
  // à la grille tarifaire.
  const quota = await checkPlanQuota(supabase, user.id, 'automations')
  if (!quota.allowed) {
    const error = quota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des automatisations.'
      : quota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer une automatisation. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${quota.plan} inclut ${quota.limit} automatisations. Passez à un plan supérieur pour en créer davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: quota.reason,
      limit: quota.limit,
      current: quota.current,
    }, { status: 403 })
  }

  const base = {
    user_id: user.id,
    name: body.name.trim(),
    trigger_event: body.trigger_event,
    trigger_button_text: body.trigger_event === 'button_clicked' ? (body.trigger_button_text?.trim() || null) : null,
    template_id: body.template_id || null,
    delay_minutes: Math.max(0, parseInt(body.delay_minutes, 10) || 0),
    quiet_start: body.quiet_start ?? null,
    quiet_end: body.quiet_end ?? null,
    timezone: body.timezone || 'Europe/Paris',
    conditions: body.conditions || {},
    is_active: body.is_active === true,
    folder_id: body.folder_id || null,
    // Le graphe du builder peut être fourni dès la création (wizard).
    graph: body.graph ?? null,
    builder_mode: body.graph ? true : (body.builder_mode === true),
  }
  // Onglet d'appartenance : 'marketing' (Campagnes) ou 'transactional'.
  const kindVal = body.kind === 'marketing' ? 'marketing' : 'transactional'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ins = (payload: Record<string, unknown>) => (supabase as any)
    .from('automations').insert(payload).select().single()

  let { data, error } = await ins({ ...base, kind: kindVal })
  // RÉSILIENCE migration : colonne kind absente → insert sans elle.
  if (error && (error.code === '42703' || /kind/.test(error.message || ''))) {
    ({ data, error } = await ins(base))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
