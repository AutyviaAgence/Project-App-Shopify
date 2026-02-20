export type StatsOverview = {
  totalMessages: number
  messagesIn: number
  messagesOut: number
  activeConversations: number
  totalContacts: number
  newContacts: number
  responseRate: number | null
  contactResponseRate: number | null
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
  bookingClicks: number
  hasBookingUrl: boolean
}

export type StatsLinkClick = {
  clicked_at: string
  referer: string | null
  country: string | null
  city: string | null
  device_type: string | null
  os: string | null
  browser: string | null
  utm_source: string | null
  utm_campaign: string | null
  is_unique: boolean | null
}

export type StatsDevicePoint = {
  type: string
  count: number
}

export type StatsCountryPoint = {
  country: string
  count: number
}

export type StatsUtmPoint = {
  source: string
  count: number
}

export type StatsPeakHourPoint = {
  hour: number
  count: number
}

export type StatsLink = {
  id: string
  slug: string | null
  name: string
  totalClicks: number
  uniqueVisitors: number
  conversionsCount: number
  isActive: boolean
  recentClicks: StatsLinkClick[]
  clicksPerDay: StatsTimePoint[]
  deviceBreakdown: StatsDevicePoint[]
  countryBreakdown: StatsCountryPoint[]
  utmBreakdown: StatsUtmPoint[]
  peakHours: StatsPeakHourPoint[]
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

export type StatsCampaign = {
  id: string
  name: string
  status: string
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  repliedCount: number
  failedCount: number
  responseRate: number
  relanceAgentId: string | null
  relanceAgentName: string | null
  startedAt: string | null
  completedAt: string | null
}

export type StatsCampaigns = {
  totalCampaigns: number
  activeCampaigns: number
  completedCampaigns: number
  totalSent: number
  totalDelivered: number
  totalReplied: number
  totalFailed: number
  overallResponseRate: number
  campaigns: StatsCampaign[]
  relanceAgentStats: StatsRelanceAgent[]
}

export type StatsRelanceAgent = {
  id: string
  name: string
  campaignsCount: number
  totalSent: number
  totalReplied: number
  responseRate: number
}

export type StatsLifecycleStage = {
  id: string
  name: string
  color: string
  icon: string | null
  conversationCount: number
  percentage: number
  inboundMessages: number
  aiProcessedMessages: number
  responseRate: number | null
  avgResponseTime: number | null
}

export type StatsLifecycleTransitionPoint = {
  date: string
  [stageId: string]: number | string
}

export type StatsLifecycle = {
  totalConversations: number
  classifiedCount: number
  classifiedPercent: number
  aiAnalysesCount: number
  manualChangesCount: number
  tokensUsed: number
  stages: StatsLifecycleStage[]
  transitionsOverTime: StatsLifecycleTransitionPoint[]
}

export type StatsResponse = {
  overview: StatsOverview
  agents: StatsAgent[]
  links: StatsLink[]
  contacts: StatsContacts
  charts: StatsCharts
  campaigns?: StatsCampaigns
  lifecycle?: StatsLifecycle
}
