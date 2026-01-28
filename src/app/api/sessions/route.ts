import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'
import { getUserTeamIds, buildAccessFilter } from '@/lib/teams/access'

/** POST /api/sessions — Créer une nouvelle session WhatsApp */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { team_id } = body as { team_id?: string }

  // Vérifier que l'utilisateur a accès à l'équipe si spécifiée
  if (team_id) {
    const teamIds = await getUserTeamIds(supabase, user.id)
    if (!teamIds.includes(team_id)) {
      return NextResponse.json({ error: 'Équipe non autorisée' }, { status: 403 })
    }
  }

  const instanceName = `wa-${user.id.slice(0, 8)}-${Date.now()}`

  // 1. Créer l'instance sur Evolution API
  const evoResult = await evolution.createInstance(instanceName)
  if (!evoResult.ok) {
    return NextResponse.json({ error: evoResult.error }, { status: 502 })
  }

  // 2. Configurer le webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await evolution.setWebhook(instanceName, `${appUrl}/api/webhook/evolution`)

  // 3. Sauvegarder en BDD
  const evoData = evoResult.data as Record<string, unknown>
  const qrcode = evoData?.qrcode as { base64?: string } | undefined

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .insert({
      user_id: user.id,
      team_id: team_id || null,
      instance_name: instanceName,
      instance_id: (evoData?.instance as Record<string, unknown>)?.instanceId as string || null,
      status: 'qr_pending' as const,
      qr_code: qrcode?.base64 || null,
    })
    .select()
    .single()

  if (dbError) {
    // Nettoyer l'instance Evolution si la BDD échoue
    await evolution.deleteInstance(instanceName)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ data: session })
}

/** GET /api/sessions — Lister les sessions de l'utilisateur (+ équipes) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les équipes de l'utilisateur
  const teamIds = await getUserTeamIds(supabase, user.id)

  // Construire la requête avec filtre d'accès
  const { data: sessions, error } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .or(buildAccessFilter(user.id, teamIds))
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Récupérer le numéro pour les sessions connectées sans phone_number
  if (sessions) {
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
  }

  return NextResponse.json({ data: sessions })
}
