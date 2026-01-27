import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/conversations — Lister les conversations de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', user.id)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const sessionIds = sessions.map((s) => s.id)
  const sessionsMap = Object.fromEntries(sessions.map((s) => [s.id, s]))

  // Récupérer les conversations
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .in('session_id', sessionIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Récupérer les contacts
  const contactIds = [...new Set(conversations.map((c) => c.contact_id))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .in('id', contactIds)

  const contactsMap = Object.fromEntries((contacts || []).map((c) => [c.id, c]))

  // Assembler les données
  const result = conversations.map((conv) => ({
    ...conv,
    contact: contactsMap[conv.contact_id] || null,
    session: {
      id: sessionsMap[conv.session_id]?.id,
      instance_name: sessionsMap[conv.session_id]?.instance_name,
      phone_number: sessionsMap[conv.session_id]?.phone_number,
    },
  }))

  return NextResponse.json({ data: result })
}
