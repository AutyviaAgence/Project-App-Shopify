import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/teams/join-code — Rejoindre une équipe via code d'invitation unique */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const code = (body.code as string)?.trim()

  if (!code) {
    return NextResponse.json({ error: 'Code requis' }, { status: 400 })
  }

  // Utiliser la fonction RPC SECURITY DEFINER pour rejoindre
  // Cette fonction contourne les RLS de manière sécurisée
  const { data: result, error: rpcError } = await supabase
    .rpc('join_team_with_code', { p_code: code })

  if (rpcError) {
    console.error('[JoinCode] RPC error:', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  // La fonction retourne un objet JSON avec error/status ou success/data
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 })
  }

  return NextResponse.json(result)
}
