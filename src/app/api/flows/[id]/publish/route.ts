import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { compileFlowJSON } from '@/lib/whatsapp-cloud/flow-compiler'
import type { FlowScreen } from '@/types/database'

/**
 * POST /api/flows/[id]/publish
 * Compile les écrans en Flow JSON, crée le Flow chez Meta (si besoin),
 * téléverse le JSON puis le publie → utilisable à l'envoi.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const bodyReq = await req.json().catch(() => ({}))
  const sessionIdOverride = (bodyReq as { session_id?: string }).session_id

  const { data: flow } = await supabase
    .from('whatsapp_flows')
    .select('*')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!flow) return NextResponse.json({ error: 'Flow introuvable' }, { status: 404 })

  const screens = (Array.isArray(flow.screens) ? flow.screens : []) as FlowScreen[]
  const withFields = screens.filter((s) => s.fields.length > 0)
  if (withFields.length === 0) {
    return NextResponse.json({ error: 'Ajoutez au moins un écran avec un champ.' }, { status: 422 })
  }

  // Session WABA
  const sessionId = sessionIdOverride || flow.session_id
  let q = supabase
    .from('whatsapp_sessions')
    .select('id, waba_business_account_id, waba_access_token')
    .eq('user_id', user.id)
    .not('waba_business_account_id', 'is', null)
  q = sessionId ? q.eq('id', sessionId) : q.limit(1)
  const { data: session } = await q.maybeSingle()
  if (!session?.waba_business_account_id || !session.waba_access_token) {
    return NextResponse.json({ error: 'Aucune session WhatsApp Business configurée.' }, { status: 400 })
  }
  const token = decryptMessage(session.waba_access_token)

  // 1) Créer le Flow chez Meta s'il n'existe pas encore.
  let metaFlowId = flow.meta_flow_id as string | null
  if (!metaFlowId) {
    const created = await wabaClient.createFlow(session.waba_business_account_id, token, { name: flow.name })
    if (!created.ok) return NextResponse.json({ error: `Création du flow refusée : ${created.error.slice(0, 200)}` }, { status: 502 })
    metaFlowId = created.data.id
  }

  // 2) Compiler + téléverser le Flow JSON.
  const flowJson = compileFlowJSON(withFields)
  const up = await wabaClient.uploadFlowJSON(metaFlowId, token, flowJson)
  if (!up.ok) return NextResponse.json({ error: `Flow JSON refusé : ${up.error.slice(0, 300)}` }, { status: 422 })
  if (up.data.validation_errors && up.data.validation_errors.length > 0) {
    return NextResponse.json({ error: `Flow invalide : ${JSON.stringify(up.data.validation_errors).slice(0, 300)}` }, { status: 422 })
  }

  // 3) Publier.
  const pub = await wabaClient.publishFlow(metaFlowId, token)
  if (!pub.ok) return NextResponse.json({ error: `Publication refusée : ${pub.error.slice(0, 200)}` }, { status: 502 })

  const { data: updated } = await supabase
    .from('whatsapp_flows')
    .update({ meta_flow_id: metaFlowId, status: 'published', session_id: session.id, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  return NextResponse.json({ data: updated })
}
