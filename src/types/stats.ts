export type StatsOverview = {
  totalMessages: number
  messagesIn: number
  messagesOut: number
  activeConversations: number
  totalContacts: number
  newContacts: number
  responseRate: number | null
  avgResponseTime: number | null
  messagesTrend: number | null
  conversationsTrend: number | null
  contactsTrend: number | null
}

export type StatsAgent = {
  id: string
  name: string
  messagesHandled: number
  conversationsManaged: number
  responseRate: number | null
  avgResponseTime: number | null
  isActive: boolean
}

export type StatsLink = {
  id: string
  slug: string | null
  name: string
  totalClicks: number
  conversionsCount: number
  isActive: boolean
}

export type StatsTopContact = {
  id: string
  name: string | null
  phoneNumber: string
  messageCount: number
  lastMessageAt: string | null
}

export type StatsContactsBySession = {
  sessionId: string
  sessionName: string
  contactCount: number
}

export type StatsContacts = {
  topContacts: StatsTopContact[]
  contactsBySession: StatsContactsBySession[]
}

export type StatsMessagePoint = {
  date: string
  inbound: number
  outbound: number
}

export type StatsTimePoint = {
  date: string
  count: number
}

export type StatsCharts = {
  messagesOverTime: StatsMessagePoint[]
  conversationsOverTime: StatsTimePoint[]
  newContactsOverTime: StatsTimePoint[]
}

export type StatsResponse = {
  overview: StatsOverview
  agents: StatsAgent[]
  links: StatsLink[]
  contacts: StatsContacts
  charts: StatsCharts
}
