import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDateRange, computeTrend, groupByDate, groupMessagesByDate } from '@/lib/stats/helpers'
import type { StatsResponse, StatsAgent, StatsLink, StatsTopContact, StatsContactsBySession } from '@/types/stats'

/** GET /api/stats?period=30&session_id=all */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const period = Math.min(Number(searchParams.get('period') || '30'), 365)
  const sessionFilter = searchParams.get('session_id') || 'all'

  const { from, to, prevFrom, prevTo } = getDateRange(period)

  // 1. Sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, instance_name')
    .eq('user_id', user.id)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: emptyResponse() })
  }

  const sessionIds = sessionFilter === 'all'
    ? sessions.map((s) => s.id)
    : sessions.filter((s) => s.id === sessionFilter).map((s) => s.id)

  if (sessionIds.length === 0) {
    return NextResponse.json({ data: emptyResponse() })
  }

  const sessionsMap = Object.fromEntries(sessions.map((s) => [s.id, s.instance_name]))

  // 2-8. Requêtes en parallèle
  const [
    messagesRes,
    prevMessagesRes,
    conversationsRes,
    prevConversationsRes,
    contactsRes,
    prevContactsRes,
    agentsRes,
    linksRes,
  ] = await Promise.all([
    // Messages période courante
    supabase
      .from('messages')
      .select('id, direction, sent_by, ai_agent_id, ai_processed, conversation_id, created_at')
      .in('session_id', sessionIds)
      .gte('created_at', from)
      .lte('created_at', to),
    // Messages période précédente (count)
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    // Conversations
    supabase
      .from('conversations')
      .select('id, contact_id, ai_agent_id, wa_link_id, last_message_at, created_at')
      .in('session_id', sessionIds),
    // Conversations période précédente (count)
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    // Contacts
    supabase
      .from('contacts')
      .select('id, session_id, phone_number, name, first_name, last_name, created_at')
      .in('session_id', sessionIds),
    // Contacts période précédente (count)
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    // Agents
    supabase
      .from('ai_agents')
      .select('id, name, is_active')
      .eq('user_id', user.id),
    // Liens
    supabase
      .from('wa_links')
      .select('id, slug, name, click_count, is_active')
      .eq('user_id', user.id),
  ])

  const messages = messagesRes.data || []
  const conversations = conversationsRes.data || []
  const contacts = contactsRes.data || []
  const agents = agentsRes.data || []
  const links = linksRes.data || []

  // --- Overview ---
  const messagesIn = messages.filter((m) => m.direction === 'inbound').length
  const messagesOut = messages.filter((m) => m.direction === 'outbound').length
  const totalMessages = messages.length
  const prevMessageCount = prevMessagesRes.count || 0

  const activeConversations = conversations.filter((c) =>
    c.last_message_at && c.last_message_at >= from
  ).length
  const prevActiveConvos = prevConversationsRes.count || 0

  const totalContacts = contacts.length
  const newContacts = contacts.filter((c) => c.created_at >= from).length
  const prevNewContacts = prevContactsRes.count || 0

  // --- Taux de réponse IA (global) ---
  const inboundMessages = messages.filter((m) => m.direction === 'inbound')
  const inboundProcessed = inboundMessages.filter((m) => m.ai_processed)
  const responseRate = inboundMessages.length > 0
    ? Math.round((inboundProcessed.length / inboundMessages.length) * 100)
    : null

  // --- Temps de réponse moyen (global) ---
  // Grouper les messages par conversation pour calculer les deltas
  const msgsByConvoForTime = new Map<string, typeof messages>()
  for (const m of messages) {
    const arr = msgsByConvoForTime.get(m.conversation_id) || []
    arr.push(m)
    msgsByConvoForTime.set(m.conversation_id, arr)
  }

  const responseTimes: number[] = []
  const responseTimesByAgent = new Map<string, number[]>()

  for (const convoMsgs of msgsByConvoForTime.values()) {
    // Trier par date
    convoMsgs.sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (let i = 0; i < convoMsgs.length; i++) {
      const msg = convoMsgs[i]
      if (msg.direction !== 'inbound' || !msg.ai_processed) continue
      // Trouver le prochain message outbound AI dans cette conversation
      for (let j = i + 1; j < convoMsgs.length; j++) {
        const next = convoMsgs[j]
        if (next.direction === 'outbound' && next.sent_by === 'ai_agent') {
          const delta = (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) / 1000
          if (delta > 0 && delta < 86400) { // ignorer les deltas > 24h (anomalies)
            responseTimes.push(delta)
            if (next.ai_agent_id) {
              const arr = responseTimesByAgent.get(next.ai_agent_id) || []
              arr.push(delta)
              responseTimesByAgent.set(next.ai_agent_id, arr)
            }
          }
          break
        }
        // Si on tombe sur un autre inbound, arrêter
        if (next.direction === 'inbound') break
      }
    }
  }

  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
    : null

  // --- Agents ---
  // Pré-calculer les inbound par agent (via conversation)
  const convoToAgent = new Map<string, string | null>()
  for (const c of conversations) {
    convoToAgent.set(c.id, c.ai_agent_id)
  }

  const agentStats: StatsAgent[] = agents.map((agent) => {
    const agentMessages = messages.filter((m) => m.ai_agent_id === agent.id)
    const agentConvos = new Set(
      conversations
        .filter((c) => c.ai_agent_id === agent.id)
        .map((c) => c.id)
    )

    // Taux de réponse par agent
    const agentInbound = inboundMessages.filter(
      (m) => convoToAgent.get(m.conversation_id) === agent.id
    )
    const agentInboundProcessed = agentInbound.filter((m) => m.ai_processed)
    const agentResponseRate = agentInbound.length > 0
      ? Math.round((agentInboundProcessed.length / agentInbound.length) * 100)
      : null

    // Temps de réponse par agent
    const agentTimes = responseTimesByAgent.get(agent.id) || []
    const agentAvgTime = agentTimes.length > 0
      ? Math.round(agentTimes.reduce((s, v) => s + v, 0) / agentTimes.length)
      : null

    return {
      id: agent.id,
      name: agent.name,
      messagesHandled: agentMessages.length,
      conversationsManaged: agentConvos.size,
      responseRate: agentResponseRate,
      avgResponseTime: agentAvgTime,
      isActive: agent.is_active,
    }
  })

  // --- Links ---
  const linkStats: StatsLink[] = links.map((link) => {
    const conversionsCount = conversations.filter(
      (c) => c.wa_link_id === link.id
    ).length
    return {
      id: link.id,
      slug: link.slug,
      name: link.name,
      totalClicks: link.click_count || 0,
      conversionsCount,
      isActive: link.is_active,
    }
  })

  // --- Contacts ---
  // Top contacts par nombre de messages
  const messagesByConvo = new Map<string, number>()
  for (const m of messages) {
    messagesByConvo.set(m.conversation_id, (messagesByConvo.get(m.conversation_id) || 0) + 1)
  }

  const convoToContact = new Map<string, string>()
  const convoLastMsg = new Map<string, string | null>()
  for (const c of conversations) {
    convoToContact.set(c.id, c.contact_id)
    convoLastMsg.set(c.id, c.last_message_at)
  }

  const contactMsgCount = new Map<string, number>()
  const contactLastMsg = new Map<string, string | null>()
  for (const [convoId, count] of messagesByConvo) {
    const contactId = convoToContact.get(convoId)
    if (contactId) {
      contactMsgCount.set(contactId, (contactMsgCount.get(contactId) || 0) + count)
      const existing = contactLastMsg.get(contactId)
      const current = convoLastMsg.get(convoId)
      if (!existing || (current && current > existing)) {
        contactLastMsg.set(contactId, current || null)
      }
    }
  }

  const contactsMap = new Map(contacts.map((c) => [c.id, c]))
  const topContacts: StatsTopContact[] = [...contactMsgCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([contactId, messageCount]) => {
      const c = contactsMap.get(contactId)
      const displayName = c
        ? (c.first_name || c.last_name
            ? `${c.first_name || ''} ${c.last_name || ''}`.trim()
            : c.name)
        : null
      return {
        id: contactId,
        name: displayName,
        phoneNumber: c?.phone_number || '',
        messageCount,
        lastMessageAt: contactLastMsg.get(contactId) || null,
      }
    })

  // Contacts par session
  const contactsBySessionMap = new Map<string, number>()
  for (const c of contacts) {
    contactsBySessionMap.set(c.session_id, (contactsBySessionMap.get(c.session_id) || 0) + 1)
  }
  const contactsBySession: StatsContactsBySession[] = [...contactsBySessionMap.entries()].map(
    ([sessionId, contactCount]) => ({
      sessionId,
      sessionName: sessionsMap[sessionId] || sessionId,
      contactCount,
    })
  )

  // --- Charts ---
  const messagesOverTime = groupMessagesByDate(messages, from, to)
  const conversationsOverTime = groupByDate(
    conversations.filter((c) => c.created_at >= from),
    'created_at',
    from,
    to
  )
  const newContactsOverTime = groupByDate(
    contacts.filter((c) => c.created_at >= from),
    'created_at',
    from,
    to
  )

  const response: StatsResponse = {
    overview: {
      totalMessages,
      messagesIn,
      messagesOut,
      activeConversations,
      totalContacts,
      newContacts,
      responseRate,
      avgResponseTime,
      messagesTrend: computeTrend(totalMessages, prevMessageCount),
      conversationsTrend: computeTrend(activeConversations, prevActiveConvos),
      contactsTrend: computeTrend(newContacts, prevNewContacts),
    },
    agents: agentStats,
    links: linkStats,
    contacts: {
      topContacts,
      contactsBySession,
    },
    charts: {
      messagesOverTime,
      conversationsOverTime,
      newContactsOverTime,
    },
  }

  return NextResponse.json({ data: response })
}

function emptyResponse(): StatsResponse {
  return {
    overview: {
      totalMessages: 0,
      messagesIn: 0,
      messagesOut: 0,
      activeConversations: 0,
      totalContacts: 0,
      newContacts: 0,
      responseRate: null,
      avgResponseTime: null,
      messagesTrend: null,
      conversationsTrend: null,
      contactsTrend: null,
    },
    agents: [],
    links: [],
    contacts: { topContacts: [], contactsBySession: [] },
    charts: {
      messagesOverTime: [],
      conversationsOverTime: [],
      newContactsOverTime: [],
    },
  }
}
