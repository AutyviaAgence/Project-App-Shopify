import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { executeAction } from '@/lib/shopify/actions'

/**
 * PATCH /api/shopify/actions/[id]  { decision: 'confirm' | 'reject' }
 * Valide (et exécute) ou refuse une action Shopify en attente.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { decision } = (await req.json().catch(() => ({}))) as { decision?: 'confirm' | 'reject' }
  if (decision !== 'confirm' && decision !== 'reject') {
    return NextResponse.json({ error: 'Décision invalide' }, { status: 400 })
  }

  // Vérifier que l'action appartient à l'utilisateur et est en attente
  const { data: action } = await supabase
    .from('shopify_actions')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!action) return NextResponse.json({ error: 'Action introuvable' }, { status: 404 })
  if (action.status !== 'pending') {
    return NextResponse.json({ error: 'Action déjà traitée' }, { status: 409 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (decision === 'reject') {
    await admin
      .from('shopify_actions')
      .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ data: { status: 'rejected' } })
  }

  // Confirmer → marquer confirmed puis exécuter
  await admin
    .from('shopify_actions')
    .update({ status: 'confirmed', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  const result = await executeAction(id)
  if (!result.ok) {
    return NextResponse.json({ data: { status: 'failed' }, error: result.error }, { status: 207 })
  }

  return NextResponse.json({ data: { status: 'executed' } })
}
