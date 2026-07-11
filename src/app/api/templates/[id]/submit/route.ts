import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { submitTemplateRow } from '@/lib/templates/submit'

/**
 * POST /api/templates/[id]/submit
 * Soumet un modèle à Meta pour approbation (passe en statut "pending").
 * La logique est dans submitTemplateRow (partagée avec la soumission groupée).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const sessionIdOverride = (body as { session_id?: string }).session_id

  const r = await submitTemplateRow(supabase, user.id, id, sessionIdOverride)
  if (!r.ok) {
    const payload: Record<string, unknown> = { error: r.error }
    if (r.token_expired) payload.token_expired = true
    if (r.retryAt) payload.retryAt = r.retryAt
    return NextResponse.json(payload, { status: r.status })
  }
  return NextResponse.json({ data: r.data })
}
