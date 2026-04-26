import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { evolution } from '@/lib/evolution/client'
import { encryptMessage } from '@/lib/crypto/encryption'
import { getUserTeamIds, getUserTeamPermissions, buildAccessFilter, filterSessionsByPermissions } from '@/lib/teams/access'
import { checkPlanQuota } from '@/lib/plan-quota'
import type { WhatsAppSession } from '@/types/database'

/** POST /api/sessions — Créer une nouvelle session WhatsApp */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { team_id, team_ids, connection_method, phone_number, integration_type, waba_phone_number_id, waba_business_account_id, waba_access_token } = body as {
    team_id?: string
    team_ids?: string[]
    connection_method?: 'qr' | 'pairing'
    phone_number?: string
    integration_type?: 'evolution' | 'waba'
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
  if (integration_type === 'waba') {
    if (!waba_phone_number_id || !waba_business_account_id || !waba_access_token) {
      return NextResponse.json(
        { error: 'Phone Number ID, Business Account ID et Access Token sont requis pour WABA' },
        { status: 400 }
      )
    }

    const instanceName = `waba-${user.id.slice(0, 8)}-${Date.now()}`

    // Vérifier le token en récupérant le numéro
    const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
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

  // ========== Evolution API (par défaut) ==========
  // Validation pairing code
  const cleanNumber = connection_method === 'pairing'
    ? phone_number?.replace(/\D/g, '')
    : undefined

  if (connection_method === 'pairing') {
    if (!cleanNumber || cleanNumber.length < 10 || cleanNumber.length > 15) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide. Format : indicatif + numéro (ex: 33612345678)' },
        { status: 400 }
      )
    }
  }

  const instanceName = `wa-${user.id.slice(0, 8)}-${Date.now()}`

  // 1. Créer l'instance sur Evolution API
  const evoResult = await evolution.createInstance(instanceName, cleanNumber)
  if (!evoResult.ok) {
    return NextResponse.json({ error: evoResult.error }, { status: 502 })
  }

  // 2. Configurer le webhook (avec secret si configuré)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET
  const secretParam = webhookSecret ? `?secret=${webhookSecret}` : ''
  await evolution.setWebhook(instanceName, `${appUrl}/api/webhook/evolution${secretParam}`)

  // 3. Sauvegarder en BDD
  const evoData = evoResult.data as Record<string, unknown>
  const qrcode = evoData?.qrcode as { base64?: string; pairingCode?: string } | undefined
  const pairingCode = (evoData?.pairingCode as string)
    || qrcode?.pairingCode
    || null

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .insert({
      user_id: user.id,
      team_id: selectedTeamIds[0] || null, // Legacy: garder le premier pour compatibilité
      instance_name: instanceName,
      instance_id: (evoData?.instance as Record<string, unknown>)?.instanceId as string || null,
      status: 'qr_pending' as const,
      qr_code: connection_method !== 'pairing' ? (qrcode?.base64 || null) : null,
      pairing_code: pairingCode,
      phone_number: cleanNumber || null,
      integration_type: 'evolution',
    })
    .select()
    .single()

  if (dbError) {
    // Nettoyer l'instance Evolution si la BDD échoue
    await evolution.deleteInstance(instanceName)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // 4. Créer les associations multi-équipes
  if (selectedTeamIds.length > 0 && session) {
    const teamAssociations = selectedTeamIds.map(teamId => ({
      session_id: session.id,
      team_id: teamId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('session_teams').insert(teamAssociations)
  }

  // Retourner avec team_ids
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
    .select('id, user_id, team_id, instance_name, instance_id, status, phone_number, display_name, qr_code, pairing_code, integration_type, waba_phone_number_id, waba_business_account_id, daily_ai_message_limit, ai_message_delay, created_at, updated_at')
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

  // Health check: sync Evolution sessions status, detect deleted instances, fill missing phone numbers
  const evoSessions = sessions.filter(
    (s) => (!s.integration_type || s.integration_type === 'evolution') && s.status !== 'error'
  )
  if (evoSessions.length > 0) {
    // Fetch all instances from Evolution API in one call
    const allInstancesResult = await evolution.fetchAllInstances()
    const instanceMap = new Map<string, { connectionStatus: string; ownerJid?: string }>()
    if (allInstancesResult.ok) {
      for (const inst of allInstancesResult.data) {
        instanceMap.set(inst.name, inst)
      }
    }

    const adminSupabase = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Helper: create a session_disconnected alert only if none exists for this session today
    const alertedSessions = new Set<string>()
    async function createDisconnectedAlert(userId: string, sessionId: string, instanceName: string, message: string, metadata: Record<string, unknown>) {
      if (alertedSessions.has(sessionId)) return
      const since = new Date()
      since.setHours(0, 0, 0, 0)
      const { data: existing } = await adminSupabase
        .from('user_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_type', 'session_disconnected')
        .contains('metadata', { session_id: sessionId })
        .gte('created_at', since.toISOString())
        .limit(1)
        .maybeSingle()
      if (existing) return
      alertedSessions.add(sessionId)
      await adminSupabase.from('user_alerts').insert({
        user_id: userId,
        alert_type: 'session_disconnected',
        title: 'Session déconnectée',
        message,
        metadata,
      })
    }

    await Promise.all(evoSessions.map(async (session) => {
      const evoInstance = instanceMap.get(session.instance_name)

      // Instance deleted from Evolution API → mark disconnected + alert (once per day)
      if (!evoInstance && allInstancesResult.ok) {
        if (session.status === 'connected' || session.status === 'qr_pending') {
          session.status = 'disconnected' as WhatsAppSession['status']
          await Promise.all([
            adminSupabase.from('whatsapp_sessions').update({ status: 'disconnected' }).eq('id', session.id),
            createDisconnectedAlert(
              session.user_id, session.id, session.instance_name,
              `L'instance "${session.instance_name}" n'existe plus sur Evolution API. Créez une nouvelle session pour reconnecter ce numéro.`,
              { session_id: session.id, instance_name: session.instance_name, detected_by: 'session_list_sync', reason: 'instance_deleted' }
            ),
          ])
        }
        return
      }

      if (!evoInstance) return

      // Sync connection status
      // NOTE: Evolution API v2.3.7 has a known bug where connectionStatus stays "open"
      // even when Baileys internal connection is dead ("Connection Closed" on send).
      // We do a real ping via getConnectionState (more reliable than fetchInstances status),
      // and if still "open", do a lightweight findMessages call to truly verify Baileys is alive.
      const evoStatus = evoInstance.connectionStatus
      let reallyConnected = evoStatus === 'open'

      if (session.status === 'connected' && evoStatus === 'open') {
        // Double-check with getConnectionState — sometimes more up-to-date than fetchInstances
        const stateResult = await evolution.getConnectionState(session.instance_name)
        if (stateResult.ok) {
          const stateData = stateResult.data as Record<string, unknown>
          const state = ((stateData?.instance as Record<string, unknown>)?.state as string) || (stateData?.state as string) || 'open'
          if (state !== 'open') {
            reallyConnected = false
          }
        }

        // If still looks "open", do a real Baileys ping via findMessages
        // This will fail with "Connection Closed" if Baileys socket is dead
        if (reallyConnected && session.phone_number) {
          const pingResult = await evolution.findMessages(
            session.instance_name,
            `${session.phone_number}@s.whatsapp.net`,
            { limit: 1 }
          )
          if (!pingResult.ok && (pingResult.error.includes('Connection Closed') || pingResult.error.includes('connection closed'))) {
            reallyConnected = false
          }
        }
      }

      if (session.status === 'connected' && !reallyConnected) {
        const newStatus = evoStatus === 'connecting' ? 'qr_pending' : 'disconnected'
        session.status = newStatus as WhatsAppSession['status']
        await adminSupabase.from('whatsapp_sessions').update({ status: newStatus }).eq('id', session.id)
        if (newStatus === 'disconnected') {
          await createDisconnectedAlert(
            session.user_id, session.id, session.instance_name,
            `La session "${session.instance_name}" est déconnectée. Reconnectez-vous via le QR code.`,
            { session_id: session.id, instance_name: session.instance_name, detected_by: 'session_list_sync', evolution_status: evoStatus }
          )
        }
      } else if (session.status !== 'connected' && evoStatus !== 'open') {
        // Also sync non-connected status (connecting → qr_pending, etc.)
        const newStatus = evoStatus === 'connecting' ? 'qr_pending' : 'disconnected'
        if (session.status !== newStatus) {
          session.status = newStatus as WhatsAppSession['status']
          await adminSupabase.from('whatsapp_sessions').update({ status: newStatus }).eq('id', session.id)
        }
      }

      // Fill missing phone number
      if (session.status === 'connected' && !session.phone_number && evoInstance.ownerJid) {
        const phoneNumber = evoInstance.ownerJid.split('@')[0]
        session.phone_number = phoneNumber
        await adminSupabase.from('whatsapp_sessions').update({ phone_number: phoneNumber }).eq('id', session.id)
      }
    }))
  }

  // Récupérer les team_ids pour chaque session
  const sessionIds = sessions.map(s => s.id)
  let sessionTeamsMap: Record<string, string[]> = {}

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
