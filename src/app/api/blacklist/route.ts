import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CampaignBlacklistReason } from '@/types/database'

const VALID_REASONS: CampaignBlacklistReason[] = ['opt_out', 'manual', 'low_engagement', 'complained']

/** GET /api/blacklist — Lister les contacts blacklistés */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  const reasonParam = searchParams.get('reason')

  // Construire la requête
  let query = supabase
    .from('campaign_blacklist')
    .select('*, contact:contacts(id, name, phone_number)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (sessionId) {
    query = query.eq('session_id', sessionId)
  }

  if (reasonParam && VALID_REASONS.includes(reasonParam as CampaignBlacklistReason)) {
    query = query.eq('reason', reasonParam as CampaignBlacklistReason)
  }

  const { data: blacklist, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: blacklist })
}

/** POST /api/blacklist — Ajouter un contact à la blacklist */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { contact_id, session_id, reason, keyword_matched } = body as {
    contact_id: string
    session_id: string
    reason: 'opt_out' | 'manual' | 'low_engagement' | 'complained'
    keyword_matched?: string
  }

  // Validation
  if (!contact_id || !session_id || !reason) {
    return NextResponse.json(
      { error: 'contact_id, session_id et reason sont requis' },
      { status: 400 }
    )
  }

  // Vérifier que le contact existe et appartient à l'utilisateur via la session
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, session_id, whatsapp_sessions!inner(user_id)')
    .eq('id', contact_id)
    .single()

  if (contactError || !contact) {
    return NextResponse.json({ error: 'Contact non trouvé' }, { status: 404 })
  }

  // Vérifier que la session appartient à l'utilisateur
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionUserId = (contact as any).whatsapp_sessions?.user_id
  if (sessionUserId !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Ajouter à la blacklist (upsert pour éviter les doublons)
  const { data: blacklistEntry, error } = await supabase
    .from('campaign_blacklist')
    .upsert(
      {
        user_id: user.id,
        contact_id,
        session_id,
        reason,
        keyword_matched: keyword_matched || null,
      },
      {
        onConflict: 'user_id,contact_id',
      }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: blacklistEntry }, { status: 201 })
}

/** DELETE /api/blacklist — Retirer un contact de la blacklist */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const contactId = searchParams.get('contact_id')

  if (!id && !contactId) {
    return NextResponse.json(
      { error: 'id ou contact_id requis' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('campaign_blacklist')
    .delete()
    .eq('user_id', user.id)

  if (id) {
    query = query.eq('id', id)
  } else if (contactId) {
    query = query.eq('contact_id', contactId)
  }

  const { error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
