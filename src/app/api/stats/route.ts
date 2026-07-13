import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getDateRange, computeTrend, groupByDate, groupMessagesByDate, groupTransitionsByDate } from '@/lib/stats/helpers'
import type { StatsResponse, StatsAgent, StatsLink, StatsTopContact, StatsContactsBySession, StatsCampaign, StatsCampaigns, StatsLifecycle, StatsLifecycleStage, StatsLifecycleTransitionPoint } from '@/types/stats'

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

  // Helper : paginer une query Supabase qui peut dépasser 1000 lignes
  async function fetchAllRows<T>(
    buildQuery: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> {
    const PAGE = 1000
    let all: T[] = []
    let offset = 0
    while (true) {
      const { data, error } = await buildQuery(offset, PAGE)
      if (error || !data) break
      all = all.concat(data)
      if (data.length < PAGE) break
      offset += PAGE
    }
    return all
  }

  // 2-8. Requêtes en parallèle
  const [
    messages,
    prevMessagesRes,
    conversations,
    prevConversationsRes,
    contacts,
    prevContactsRes,
    agentsRes,
    linksRes,
    campaignsRes,
    lifecycleStagesRes,
  ] = await Promise.all([
    // Messages période courante (paginé - peut dépasser 1000)
    fetchAllRows<{ id: string; direction: string; sent_by: string; ai_agent_id: string | null; ai_processed: boolean; conversation_id: string; created_at: string }>(
      (offset, limit) => supabase
        .from('messages')
        .select('id, direction, sent_by, ai_agent_id, ai_processed, conversation_id, created_at')
        .in('session_id', sessionIds)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at')
        .range(offset, offset + limit - 1)
    ),
    // Messages période précédente (count)
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    // Conversations (paginé - peut dépasser 1000)
    fetchAllRows<{ id: string; contact_id: string; ai_agent_id: string | null; wa_link_id: string | null; last_message_at: string | null; created_at: string; lifecycle_stage_id: string | null }>(
      (offset, limit) => supabase
        .from('conversations')
        .select('id, contact_id, ai_agent_id, wa_link_id, last_message_at, created_at, lifecycle_stage_id')
        .in('session_id', sessionIds)
        .order('created_at')
        .range(offset, offset + limit - 1)
    ),
    // Conversations période précédente (count)
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    // Contacts (paginé - peut dépasser 1000)
    fetchAllRows<{ id: string; session_id: string; phone_number: string; name: string | null; first_name: string | null; last_name: string | null; created_at: string }>(
      (offset, limit) => supabase
        .from('contacts')
        .select('id, session_id, phone_number, name, first_name, last_name, created_at')
        .in('session_id', sessionIds)
        .order('created_at')
        .range(offset, offset + limit - 1)
    ),
    // Contacts période précédente (count)
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    // Agents (utilisateur)
    supabase
      .from('ai_agents')
      .select('id, name, is_active, booking_url')
      .eq('user_id', user.id),
    // Liens (utilisateur)
    supabase
      .from('wa_links')
      .select('id, slug, name, click_count, is_active')
      .eq('user_id', user.id),
    // Campagnes (utilisateur)
    supabase
      .from('campaigns')
      .select('id, name, status, total_recipients, sent_count, delivered_count, replied_count, failed_count, started_at, completed_at')
      .eq('user_id', user.id),
    // Lifecycle stages
    supabase
      .from('lifecycle_stages')
      .select('id, name, color, icon, position')
      .eq('user_id', user.id)
      .order('position'),
  ])

  const agents = agentsRes.data || []
  const links = linksRes.data || []
  const campaigns = campaignsRes.data || []
  const lifecycleStages = lifecycleStagesRes.data || []

  // Lifecycle history (batch 2 - dépend des convIds)
  let lifecycleHistory: { id: string; conversation_id: string; from_stage_id: string | null; to_stage_id: string | null; changed_by: string; tokens_used: number; created_at: string }[] = []
  if (lifecycleStages.length > 0) {
    const convIds = conversations.map((c) => c.id)
    if (convIds.length > 0) {
      const { data: historyData } = await supabase
        .from('lifecycle_history')
        .select('id, conversation_id, from_stage_id, to_stage_id, changed_by, tokens_used, created_at')
        .in('conversation_id', convIds)
        .gte('created_at', from)
        .lte('created_at', to)
      lifecycleHistory = historyData || []
    }
  }

  // Récupérer les clics de booking par agent (pour la période)
  const agentIds = agents.map((a) => a.id)
  const bookingClicksByAgent: Record<string, number> = {}
  if (agentIds.length > 0) {
    // Note: booking_link_clicks table created via migration
    const { data: bookingClicks } = await supabase
      .from('booking_link_clicks' as 'messages') // Type cast car table pas encore dans types
      .select('agent_id')
      .in('agent_id', agentIds)
      .gte('clicked_at', from)
      .lte('clicked_at', to) as { data: { agent_id: string }[] | null }

    if (bookingClicks) {
      for (const click of bookingClicks) {
        bookingClicksByAgent[click.agent_id] = (bookingClicksByAgent[click.agent_id] || 0) + 1
      }
    }
  }

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

  // --- Taux de réponse contact (conversations initiées par nous → contact a répondu) ---
  const msgsByConvo = new Map<string, typeof messages>()
  for (const m of messages) {
    const arr = msgsByConvo.get(m.conversation_id) || []
    arr.push(m)
    msgsByConvo.set(m.conversation_id, arr)
  }

  let outboundFirstConvos = 0
  let contactRepliedConvos = 0
  for (const convoMsgs of msgsByConvo.values()) {
    convoMsgs.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (convoMsgs[0]?.direction === 'outbound') {
      outboundFirstConvos++
      if (convoMsgs.some((m) => m.direction === 'inbound')) {
        contactRepliedConvos++
      }
    }
  }
  const contactResponseRate = outboundFirstConvos > 0
    ? Math.round((contactRepliedConvos / outboundFirstConvos) * 100)
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
    // Messages gérés = ceux tagués `ai_agent_id`, PLUS (fallback) les messages
    // sortants IA d'une conversation assignée à cet agent mais dont le message
    // n'a pas été tagué (robustesse : attribution message manquante ponctuelle).
    const agentMessages = messages.filter((m) =>
      m.ai_agent_id === agent.id
      || (!m.ai_agent_id && m.direction === 'outbound' && (m.sent_by === 'ai_agent' || m.sent_by === 'ai')
          && convoToAgent.get(m.conversation_id) === agent.id)
    )
    // Conversations gérées = celles assignées à l'agent OU celles où il a au moins
    // un message tagué (couvre les convs non ré-assignées mais réellement traitées).
    const agentConvos = new Set<string>()
    for (const c of conversations) if (c.ai_agent_id === agent.id) agentConvos.add(c.id)
    for (const m of agentMessages) if (m.conversation_id) agentConvos.add(m.conversation_id)

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
      bookingClicks: bookingClicksByAgent[agent.id] || 0,
      hasBookingUrl: !!agent.booking_url,
    }
  })

  // --- Links ---
  // Récupérer l'historique des clics enrichis pour les liens
  type LinkClick = {
    link_id: string; clicked_at: string; referer: string | null
    ip_hash: string | null; country: string | null; city: string | null
    device_type: string | null; os: string | null; browser: string | null
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
    is_unique: boolean | null
  }
  const linkIds = links.map((l) => l.id)
  let allLinkClicks: LinkClick[] = []
  if (linkIds.length > 0) {
    // Use admin client to bypass RLS (access already secured by filtering on user's own linkIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminSb = await createAdminClient() as any
    allLinkClicks = await fetchAllRows<LinkClick>(
      (offset, limit) => adminSb
        .from('link_clicks')
        .select('link_id, clicked_at, referer, ip_hash, country, city, device_type, os, browser, utm_source, utm_medium, utm_campaign, is_unique')
        .in('link_id', linkIds)
        .gte('clicked_at', from)
        .lte('clicked_at', to)
        .order('clicked_at', { ascending: false })
        .range(offset, offset + limit - 1)
    )
  }

  // Grouper les clics par lien
  const clicksByLink = new Map<string, LinkClick[]>()
  for (const click of allLinkClicks) {
    const arr = clicksByLink.get(click.link_id) || []
    arr.push(click)
    clicksByLink.set(click.link_id, arr)
  }

  const linkStats: StatsLink[] = links.map((link) => {
    const conversionsCount = conversations.filter(
      (c) => c.wa_link_id === link.id
    ).length

    const clicks = clicksByLink.get(link.id) || []

    // Clics par jour
    const clicksByDay = new Map<string, number>()
    for (const click of clicks) {
      const day = click.clicked_at.slice(0, 10)
      clicksByDay.set(day, (clicksByDay.get(day) || 0) + 1)
    }
    const clicksPerDay = Array.from(clicksByDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Visiteurs uniques
    const uniqueVisitors = clicks.filter((c) => c.is_unique === true).length

    // Répartition appareils
    const deviceMap = new Map<string, number>()
    for (const c of clicks) {
      const d = c.device_type ?? 'unknown'
      deviceMap.set(d, (deviceMap.get(d) || 0) + 1)
    }
    const deviceBreakdown = Array.from(deviceMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    // Répartition pays (top 10)
    const countryMap = new Map<string, number>()
    for (const c of clicks) {
      const co = c.country ?? 'unknown'
      countryMap.set(co, (countryMap.get(co) || 0) + 1)
    }
    const countryBreakdown = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Sources UTM
    const utmMap = new Map<string, number>()
    for (const c of clicks) {
      const u = c.utm_source ?? '(direct)'
      utmMap.set(u, (utmMap.get(u) || 0) + 1)
    }
    const utmBreakdown = Array.from(utmMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    // Heures de pointe (0-23)
    const hourMap = new Map<number, number>()
    for (let h = 0; h < 24; h++) hourMap.set(h, 0)
    for (const c of clicks) {
      const hour = new Date(c.clicked_at).getUTCHours()
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
    }
    const peakHours = Array.from(hourMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour)

    return {
      id: link.id,
      slug: link.slug,
      name: link.name,
      totalClicks: link.click_count || 0,
      uniqueVisitors,
      conversionsCount,
      isActive: link.is_active,
      recentClicks: clicks.slice(0, 50).map((c) => ({
        clicked_at: c.clicked_at,
        referer: c.referer,
        country: c.country,
        city: c.city,
        device_type: c.device_type,
        os: c.os,
        browser: c.browser,
        utm_source: c.utm_source,
        utm_campaign: c.utm_campaign,
        is_unique: c.is_unique,
      })),
      clicksPerDay,
      deviceBreakdown,
      countryBreakdown,
      utmBreakdown,
      peakHours,
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

  // --- Campaigns ---
  const campaignStats: StatsCampaign[] = campaigns.map((campaign) => {
    const responseRate = campaign.sent_count > 0
      ? Math.round((campaign.replied_count / campaign.sent_count) * 100)
      : 0
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalRecipients: campaign.total_recipients,
      sentCount: campaign.sent_count,
      deliveredCount: campaign.delivered_count,
      repliedCount: campaign.replied_count,
      failedCount: campaign.failed_count,
      responseRate,
      startedAt: campaign.started_at,
      completedAt: campaign.completed_at,
    }
  })

  // Aggregate campaign stats
  const totalCampaigns = campaigns.length
  const activeCampaigns = campaigns.filter((c) => c.status === 'running' || c.status === 'paused').length
  const completedCampaigns = campaigns.filter((c) => c.status === 'completed').length
  const totalCampaignSent = campaigns.reduce((sum, c) => sum + c.sent_count, 0)
  const totalCampaignDelivered = campaigns.reduce((sum, c) => sum + c.delivered_count, 0)
  const totalCampaignReplied = campaigns.reduce((sum, c) => sum + c.replied_count, 0)
  const totalCampaignFailed = campaigns.reduce((sum, c) => sum + c.failed_count, 0)
  const overallCampaignResponseRate = totalCampaignSent > 0
    ? Math.round((totalCampaignReplied / totalCampaignSent) * 100)
    : 0

  const campaignsData: StatsCampaigns = {
    totalCampaigns,
    activeCampaigns,
    completedCampaigns,
    totalSent: totalCampaignSent,
    totalDelivered: totalCampaignDelivered,
    totalReplied: totalCampaignReplied,
    totalFailed: totalCampaignFailed,
    overallResponseRate: overallCampaignResponseRate,
    campaigns: campaignStats,
  }

  // --- Lifecycle ---
  let lifecycleData: StatsLifecycle | undefined
  if (lifecycleStages.length > 0) {
    const totalConvs = conversations.length
    const classifiedConvs = conversations.filter((c) => c.lifecycle_stage_id).length

    const stageStats: StatsLifecycleStage[] = lifecycleStages.map((stage) => {
      const stageConvIds = new Set(
        conversations.filter((c) => c.lifecycle_stage_id === stage.id).map((c) => c.id)
      )
      const stageInbound = inboundMessages.filter((m) => stageConvIds.has(m.conversation_id))
      const stageProcessed = stageInbound.filter((m) => m.ai_processed)
      const stageResponseRate = stageInbound.length > 0
        ? Math.round((stageProcessed.length / stageInbound.length) * 100)
        : null

      // Temps de réponse par stade
      const stageResponseTimes: number[] = []
      for (const convoId of stageConvIds) {
        const convoMsgs = msgsByConvoForTime.get(convoId) || []
        for (let i = 0; i < convoMsgs.length; i++) {
          const msg = convoMsgs[i]
          if (msg.direction !== 'inbound' || !msg.ai_processed) continue
          for (let j = i + 1; j < convoMsgs.length; j++) {
            const next = convoMsgs[j]
            if (next.direction === 'outbound' && next.sent_by === 'ai_agent') {
              const delta = (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) / 1000
              if (delta > 0 && delta < 86400) stageResponseTimes.push(delta)
              break
            }
            if (next.direction === 'inbound') break
          }
        }
      }

      return {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        icon: stage.icon,
        conversationCount: stageConvIds.size,
        percentage: totalConvs > 0 ? Math.round((stageConvIds.size / totalConvs) * 100) : 0,
        inboundMessages: stageInbound.length,
        aiProcessedMessages: stageProcessed.length,
        responseRate: stageResponseRate,
        avgResponseTime: stageResponseTimes.length > 0
          ? Math.round(stageResponseTimes.reduce((s, v) => s + v, 0) / stageResponseTimes.length)
          : null,
      }
    })

    const transitionsOverTime = groupTransitionsByDate(lifecycleHistory, lifecycleStages, from, to) as StatsLifecycleTransitionPoint[]
    const aiAnalyses = lifecycleHistory.filter((h) => h.changed_by === 'ai').length
    const manualChanges = lifecycleHistory.filter((h) => h.changed_by === 'user').length
    const tokensUsed = lifecycleHistory.reduce((sum, h) => sum + (h.tokens_used || 0), 0)

    lifecycleData = {
      totalConversations: totalConvs,
      classifiedCount: classifiedConvs,
      classifiedPercent: totalConvs > 0 ? Math.round((classifiedConvs / totalConvs) * 100) : 0,
      aiAnalysesCount: aiAnalyses,
      manualChangesCount: manualChanges,
      tokensUsed,
      stages: stageStats,
      transitionsOverTime,
    }
  }

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
      totalConversations: conversations.length,
      activeConversations,
      totalContacts,
      newContacts,
      responseRate,
      contactResponseRate,
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
    campaigns: campaignsData,
    lifecycle: lifecycleData,
  }

  return NextResponse.json({ data: response })
}

function emptyResponse(): StatsResponse {
  return {
    overview: {
      totalMessages: 0,
      messagesIn: 0,
      messagesOut: 0,
      totalConversations: 0,
      activeConversations: 0,
      totalContacts: 0,
      newContacts: 0,
      responseRate: null,
      contactResponseRate: null,
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
