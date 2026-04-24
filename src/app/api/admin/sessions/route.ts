import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { evolution } from '@/lib/evolution/client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: sessions } = await admin
    .from('whatsapp_sessions')
    .select('id, instance_name, phone_number, status, integration_type, user_id')
    .order('status', { ascending: true })

  if (!sessions) return NextResponse.json({ sessions: [] })

  // Enrichir avec les infos utilisateur
  const userIds = [...new Set(sessions.map(s => s.user_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds)

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))

  // Récupérer l'état réel depuis Evolution API pour les sessions evolution
  const evolutionStates: Record<string, string> = {}
  if (sessions.some(s => s.integration_type === 'evolution')) {
    const result = await evolution.fetchAllInstances()
    if (result.ok && Array.isArray(result.data)) {
      for (const inst of result.data) {
        const name = (inst as any).name || (inst as any).instance?.instanceName
        const state = (inst as any).connectionStatus || (inst as any).instance?.connectionStatus
        if (name) evolutionStates[name] = state
      }
    }
  }

  const enriched = sessions.map(s => ({
    ...s,
    user_email: profileMap[s.user_id]?.email ?? null,
    user_name: profileMap[s.user_id]?.full_name ?? null,
    evolution_state: s.integration_type === 'evolution' ? (evolutionStates[s.instance_name] ?? 'unknown') : null,
  }))

  return NextResponse.json({ sessions: enriched })
}
