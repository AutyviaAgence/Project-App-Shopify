import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWabaSession } from '@/lib/whatsapp-cloud/create-session'
import { checkPlanQuota } from '@/lib/plan-quota'

/** POST /api/sessions — Créer une nouvelle session WhatsApp (WABA) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { waba_phone_number_id, waba_business_account_id, waba_access_token } = body as {
    waba_phone_number_id?: string
    waba_business_account_id?: string
    waba_access_token?: string
  }

  // Vérifier le quota de sessions selon le plan.
  // Exception onboarding : la 1ʳᵉ session WhatsApp est autorisée AVANT le choix
  // du plan (l'abonnement est la DERNIÈRE étape du grand onboarding).
  let sessionQuota: Awaited<ReturnType<typeof checkPlanQuota>> = await checkPlanQuota(supabase, user.id, 'sessions')
  if (!sessionQuota.allowed && sessionQuota.reason === 'no_subscription') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle()
    const { count: waCount } = await supabase
      .from('whatsapp_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    if (!prof?.onboarding_completed_at && (waCount ?? 0) === 0) {
      sessionQuota = { allowed: true }
    }
  }
  if (!sessionQuota.allowed) {
    const error = sessionQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des sessions WhatsApp.'
      : sessionQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer une session WhatsApp. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${sessionQuota.plan} inclut ${sessionQuota.limit} session(s) WhatsApp. Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: sessionQuota.reason,
      limit: sessionQuota.limit,
      current: sessionQuota.current,
    }, { status: 403 })
  }

  // ========== WABA (WhatsApp Cloud API) ==========
  if (!waba_phone_number_id || !waba_business_account_id || !waba_access_token) {
    return NextResponse.json(
      { error: 'Phone Number ID, Business Account ID et Access Token sont requis' },
      { status: 400 }
    )
  }

  // Création + effets de bord (import modèles, lien WA) : logique partagée avec
  // l'Embedded Signup (POST /api/whatsapp/embedded-signup).
  const result = await createWabaSession(supabase, user.id, {
    waba_phone_number_id,
    waba_business_account_id,
    waba_access_token,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ data: result.session, imported_templates: result.importedTemplates })
}

/** GET /api/sessions — Lister les sessions de l'utilisateur (+ équipes avec permissions) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Sessions de l'utilisateur (système d'équipes retiré). Champs sensibles exclus.
  const { data: sessions, error } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, instance_name, status, phone_number, display_name, integration_type, waba_phone_number_id, waba_business_account_id, daily_ai_message_limit, ai_message_delay, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: sessions || [] })
}
