import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/shopify/actions?status=pending — Liste les actions de l'utilisateur */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const status = req.nextUrl.searchParams.get('status')
  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  let query = supabase
    .from('shopify_actions')
    .select('id, conversation_id, contact_id, action_type, payload, result, summary, status, error_message, created_at, executed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status as 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed')
  if (conversationId) query = query.eq('conversation_id', conversationId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
