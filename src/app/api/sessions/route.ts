import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'
import { getUserTeamIds, getUserTeamPermissions, buildAccessFilter, filterSessionsByPermissions } from '@/lib/teams/access'
import type { WhatsAppSession } from '@/types/database'

/** POST /api/sessions — Créer une nouvelle session WhatsApp */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { team_id, team_ids, connection_method, phone_number } = body as {
    team_id?: string
    team_ids?: string[]
    connection_method?: 'qr' | 'pairing'
    phone_number?: string
  }

  // Support des deux formats: team_id (legacy) et team_ids (nouveau)
  const selectedTeamIds = team_ids || (team_id ? [team_id] : [])

  // Vérifier que l'utilisateur a accès aux équipes spécifiées
  if (selectedTeamIds.length > 0) {
    const userTeamIds = await getUserTeamIds(supabase, user.id)
    const unauthorized = selectedTeamIds.filter(id => !userTeamIds.includes(id))
    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Équipe(s) non autorisée(s)' }, { status: 403 })
    }
  }

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

  // 2. Configurer le webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await evolution.setWebhook(instanceName, `${appUrl}/api/webhook/evolution`)

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
  const { data: allSessions, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
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

  // Récupérer le numéro pour les sessions connectées sans phone_number
  for (const session of sessions) {
    if (session.status === 'connected' && !session.phone_number) {
      const instanceResult = await evolution.fetchInstance(session.instance_name)
      if (instanceResult.ok) {
        const instances = instanceResult.data as Array<Record<string, unknown>>
        const instance = Array.isArray(instances) ? instances[0] : instances
        const owner = (instance as Record<string, unknown>)?.ownerJid as string | undefined
        if (owner) {
          const phoneNumber = owner.split('@')[0]
          session.phone_number = phoneNumber
          // Sauvegarder en BDD pour les prochains appels
          await supabase
            .from('whatsapp_sessions')
            .update({ phone_number: phoneNumber })
            .eq('id', session.id)
        }
      }
    }
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

  // Ajouter team_ids à chaque session
  const sessionsWithTeams = sessions.map(s => ({
    ...s,
    team_ids: sessionTeamsMap[s.id] || (s.team_id ? [s.team_id] : [])
  }))

  return NextResponse.json({ data: sessionsWithTeams })
}
