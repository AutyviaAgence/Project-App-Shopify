import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptWabaToken } from '@/lib/messaging/send'
import { wabaClient } from '@/lib/whatsapp-cloud/client'

/**
 * GET /api/templates/debug-meta?name=marketing
 * DIAGNOSTIC TEMPORAIRE — renvoie la définition EXACTE d'un template telle
 * qu'approuvée chez Meta (components réels), pour comprendre le format d'envoi
 * attendu (carrousel, headers par carte, boutons). À supprimer après debug.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') || 'marketing'

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_business_account_id, waba_access_token')
    .eq('user_id', user.id)
    .eq('integration_type', 'waba')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!session?.waba_business_account_id) {
    return NextResponse.json({ error: 'Pas de session WABA' }, { status: 400 })
  }

  const token = decryptWabaToken(session)
  if (!token) return NextResponse.json({ error: 'Token indéchiffrable' }, { status: 500 })

  const res = await wabaClient.listTemplates(session.waba_business_account_id, token)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })

  // Ne garder que le(s) template(s) demandé(s) — components complets.
  const matches = res.data.data.filter((t) => t.name === name)
  return NextResponse.json({ count: matches.length, templates: matches })
}
