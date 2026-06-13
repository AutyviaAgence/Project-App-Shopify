import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/** PATCH /api/flows/[id] — modifier un flow (brouillon) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  for (const k of ['name', 'cta_text', 'body_text', 'screens'] as const) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  // Modifier le contenu d'un flow publié → repasse en brouillon (à republier).
  if (body.screens !== undefined) {
    const { data: cur } = await supabase.from('whatsapp_flows').select('status').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (cur?.status === 'published') updates.status = 'draft'
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('whatsapp_flows')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** DELETE /api/flows/[id] — supprimer (local + Meta si publié) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: flow } = await supabase
    .from('whatsapp_flows')
    .select('id, meta_flow_id, session_id')
    .eq('id', id).eq('user_id', user.id).maybeSingle()

  if (flow?.meta_flow_id && flow.session_id) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('waba_access_token')
      .eq('id', flow.session_id).eq('user_id', user.id).maybeSingle()
    if (session?.waba_access_token) {
      const token = decryptMessage(session.waba_access_token)
      await wabaClient.deleteFlow(flow.meta_flow_id, token).catch(() => {})
    }
  }

  await supabase.from('whatsapp_flows').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
