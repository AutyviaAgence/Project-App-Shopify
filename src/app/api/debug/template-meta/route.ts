import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * Debug TEMPORAIRE — compare la définition d'un template chez Meta vs en local.
 * Sert à diagnostiquer l'erreur 132000 (nombre de paramètres ne correspond pas).
 *
 *   GET /api/debug/template-meta?name=panier_abandonne  (Authorization: Bearer CRON_SECRET)
 *
 * Ne renvoie JAMAIS le token : seulement la structure des composants Meta.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const name = new URL(req.url).searchParams.get('name') || ''
  if (!name) return NextResponse.json({ error: 'name manquant' }, { status: 400 })

  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Local
  const { data: local } = await supabase
    .from('whatsapp_templates')
    .select('name, language, status, variables_count, variable_keys, body_text, meta_id')
    .eq('name', name)

  // Une session connectée avec credentials
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_business_account_id, waba_access_token')
    .eq('status', 'connected')
    .not('waba_business_account_id', 'is', null)
    .not('waba_access_token', 'is', null)
    .limit(1)
    .maybeSingle()

  if (!session?.waba_business_account_id) {
    return NextResponse.json({ local, meta: 'pas de session WABA' })
  }

  const { decryptWabaToken } = await import('@/lib/messaging/send')
  const token = decryptWabaToken(session)
  if (!token) return NextResponse.json({ local, meta: 'pas de token' })

  const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
  const res = await wabaClient.listTemplates(session.waba_business_account_id, token)

  // On ne renvoie que la structure des composants (pas de secret)
  type T = { name?: string; language?: string; status?: string; components?: unknown }
  const list = (res.ok ? (res.data as { data?: T[] })?.data : []) || []
  const meta = list
    .filter((t) => t.name === name)
    .map((t) => ({
      name: t.name,
      language: t.language,
      status: t.status,
      components: t.components,
    }))

  return NextResponse.json({ local, meta, metaOk: res.ok, metaError: res.ok ? null : res.error })
}
