import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { encryptMessage } from '@/lib/crypto/encryption'
import { getUserTeamIds, getUserTeamPermissions, buildAccessFilter, filterSessionsByPermissions } from '@/lib/teams/access'
import { checkPlanQuota } from '@/lib/plan-quota'
import type { WhatsAppSession } from '@/types/database'

/** POST /api/sessions — Créer une nouvelle session WhatsApp (WABA) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { team_id, team_ids, waba_phone_number_id, waba_business_account_id, waba_access_token } = body as {
    team_id?: string
    team_ids?: string[]
    waba_phone_number_id?: string
    waba_business_account_id?: string
    waba_access_token?: string
  }

  // Support des deux formats: team_id (legacy) et team_ids (nouveau)
  const selectedTeamIds = team_ids || (team_id ? [team_id] : [])

  // Vérifier le quota de sessions selon le plan
  const sessionQuota = await checkPlanQuota(supabase, user.id, 'sessions')
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

  // Vérifier que l'utilisateur a accès aux équipes spécifiées
  if (selectedTeamIds.length > 0) {
    const userTeamIds = await getUserTeamIds(supabase, user.id)
    const unauthorized = selectedTeamIds.filter(id => !userTeamIds.includes(id))
    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Équipe(s) non autorisée(s)' }, { status: 403 })
    }
  }

  // ========== WABA (WhatsApp Cloud API) ==========
  if (!waba_phone_number_id || !waba_business_account_id || !waba_access_token) {
    return NextResponse.json(
      { error: 'Phone Number ID, Business Account ID et Access Token sont requis' },
      { status: 400 }
    )
  }

  const instanceName = `waba-${user.id.slice(0, 8)}-${Date.now()}`

  // Vérifier le token en récupérant le numéro
  const phoneResult = await wabaClient.getPhoneNumber(waba_phone_number_id, waba_access_token)

  let displayPhone: string | null = null
  if (phoneResult.ok) {
    displayPhone = phoneResult.data.display_phone_number
  }

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .insert({
      user_id: user.id,
      team_id: selectedTeamIds[0] || null,
      instance_name: instanceName,
      status: 'connected' as const,
      phone_number: displayPhone?.replace(/\D/g, '') || null,
      integration_type: 'waba',
      waba_phone_number_id,
      waba_business_account_id: waba_business_account_id,
      waba_access_token: encryptMessage(waba_access_token),
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Créer les associations multi-équipes
  if (selectedTeamIds.length > 0 && session) {
    const teamAssociations = selectedTeamIds.map(teamId => ({
      session_id: session.id,
      team_id: teamId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('session_teams').insert(teamAssociations)
  }

  return NextResponse.json({
    data: { ...session, team_ids: selectedTeamIds }
  })
}

/** GET /api/sessions — Lister les sessions de l'utilisateur (+ équipes avec permissions) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les équipes et permissions de l'utilisateur
  const [teamIds, permissions] = await Promise.all([
    getUserTeamIds(supabase, user.id),
    getUserTeamPermissions(supabase, user.id)
  ])

  // Construire la requête avec filtre d'accès basique (équipes)
  // Ne pas sélectionner les champs sensibles (waba_access_token, etc.)
  const { data: allSessions, error } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id, instance_name, status, phone_number, display_name, integration_type, waba_phone_number_id, waba_business_account_id, daily_ai_message_limit, ai_message_delay, created_at, updated_at')
    .or(buildAccessFilter(user.id, teamIds))
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filtrer selon les permissions granulaires
  const sessions = filterSessionsByPermissions(
    (allSessions || []) as (WhatsAppSession & { id: string; user_id: string; team_id: string | null })[],
    user.id,
    permissions
  )

  // Récupérer les team_ids pour chaque session
  const sessionIds = sessions.map(s => s.id)
  const sessionTeamsMap: Record<string, string[]> = {}

  if (sessionIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionTeams } = await (supabase as any)
      .from('session_teams')
      .select('session_id, team_id')
      .in('session_id', sessionIds) as { data: { session_id: string; team_id: string }[] | null }

    if (sessionTeams) {
      for (const st of sessionTeams) {
        if (!sessionTeamsMap[st.session_id]) {
          sessionTeamsMap[st.session_id] = []
        }
        sessionTeamsMap[st.session_id].push(st.team_id)
      }
    }
  }

  // Récupérer les infos des propriétaires pour les sessions partagées via équipe
  const foreignOwnerIds = [...new Set(sessions.filter(s => s.user_id !== user.id).map(s => s.user_id))]
  const ownerMap: Record<string, { full_name: string | null; email: string | null }> = {}

  if (foreignOwnerIds.length > 0) {
    const adminSupabase2 = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: owners } = await adminSupabase2
      .from('profiles')
      .select('id, full_name, email')
      .in('id', foreignOwnerIds)
    if (owners) {
      for (const o of owners) {
        ownerMap[o.id] = { full_name: o.full_name, email: o.email }
      }
    }
  }

  // Ajouter team_ids et owner_info à chaque session
  const sessionsWithTeams = sessions.map(s => ({
    ...s,
    team_ids: sessionTeamsMap[s.id] || (s.team_id ? [s.team_id] : []),
    owner_info: s.user_id !== user.id ? (ownerMap[s.user_id] ?? null) : null,
  }))

  return NextResponse.json({ data: sessionsWithTeams })
}
