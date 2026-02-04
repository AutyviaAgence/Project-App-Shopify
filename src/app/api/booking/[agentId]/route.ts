import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/** GET /api/booking/[agentId] — Redirection trackée vers le lien de RDV */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const supabase = await createClient()

  // Récupérer l'agent et son booking_url
  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('id, name, booking_url, user_id')
    .eq('id', agentId)
    .single()

  if (error || !agent || !agent.booking_url) {
    return NextResponse.json(
      { error: 'Lien de rendez-vous non trouvé' },
      { status: 404 }
    )
  }

  // Récupérer les paramètres de tracking optionnels
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conv')
  const contactId = searchParams.get('contact')
  const sessionId = searchParams.get('session')

  // Hash de l'IP pour anonymisation
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip + 'salt').digest('hex').substring(0, 16)

  // Enregistrer le clic
  const userAgent = req.headers.get('user-agent') || null
  const referer = req.headers.get('referer') || null

  // Trouver la dernière proposition de RDV pour cette conversation (si elle existe)
  let proposalId: string | null = null
  if (conversationId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: proposal } = await (supabase as any)
      .from('booking_proposals')
      .select('id')
      .eq('agent_id', agentId)
      .eq('conversation_id', conversationId)
      .eq('clicked', false)
      .order('proposed_at', { ascending: false })
      .limit(1)
      .single() as { data: { id: string } | null }

    if (proposal) {
      proposalId = proposal.id
      // Marquer la proposition comme cliquée
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('booking_proposals')
        .update({ clicked: true, clicked_at: new Date().toISOString() })
        .eq('id', proposalId)
    }
  }

  // Enregistrer le clic avec la référence à la proposition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('booking_link_clicks').insert({
    agent_id: agentId,
    conversation_id: conversationId || null,
    contact_id: contactId || null,
    session_id: sessionId || null,
    user_agent: userAgent,
    ip_hash: ipHash,
    referer: referer,
    proposal_id: proposalId,
  })

  // Créer une notification pour l'utilisateur propriétaire de l'agent
  if (agent.user_id) {
    // Récupérer les infos du contact si disponible
    let contactName = 'Un contact'
    let contactPhone = ''
    if (contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, name, phone_number')
        .eq('id', contactId)
        .single()

      if (contact) {
        const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        contactName = fullName || contact.name || `+${contact.phone_number}`
        contactPhone = contact.phone_number
      }
    }

    await supabase.from('user_alerts').insert({
      user_id: agent.user_id,
      alert_type: 'booking_click',
      title: 'Clic sur lien de rendez-vous',
      message: `${contactName} a cliqué sur le lien de rendez-vous proposé par l'agent "${agent.name}".${contactPhone ? ` (${contactPhone})` : ''}`,
      metadata: {
        conversation_id: conversationId || null,
        contact_id: contactId || null,
        session_id: sessionId || null,
        agent_id: agentId,
        agent_name: agent.name,
        contact_name: contactName,
        contact_phone: contactPhone || null,
        type: 'booking_click',
      },
    })
  }

  // Rediriger vers le lien de RDV
  return NextResponse.redirect(agent.booking_url, 302)
}
