import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/shopify/actions/pending-conversations
 * Renvoie les IDs des conversations ayant au moins une action Shopify "pending".
 * Sert à mettre en avant (badge + tri) ces conversations dans la liste.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabase
    .from('shopify_actions')
    .select('conversation_id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .not('conversation_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = [...new Set((data || []).map((a) => a.conversation_id))]
  return NextResponse.json({ conversationIds: ids })
}
