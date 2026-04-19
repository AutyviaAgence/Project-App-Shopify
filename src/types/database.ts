export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled'

export type Tenant = {
  id: string
  slug: string
  domain: string | null
  app_name: string
  logo_url: string
  favicon_url: string | null
  primary_color: string
  accent_color: string
  sidebar_color: string
  support_email: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  timezone: string
  data_retention_months: number | null // null = conserver indéfiniment
  lifecycle_analysis_threshold: number | null // null = manuel, 1/3/5/10 = auto
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  subscription_ends_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  tokens_used: number
  tokens_limit: number
  token_usage_period_start: string | null
  tenant_id: string | null
  created_at: string
  updated_at: string
}

export type PaymentHistory = {
  id: string
  user_id: string
  amount: number // en centimes
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type IntegrationType = 'evolution' | 'waba'

export type WhatsAppSession = {
  id: string
  user_id: string
  team_id: string | null
  instance_name: string
  instance_id: string | null
  display_name: string | null
  status: 'connected' | 'disconnected' | 'qr_pending' | 'error'
  qr_code: string | null
  pairing_code: string | null
  phone_number: string | null
  daily_ai_message_limit: number | null
  ai_message_delay: number | null
  integration_type: IntegrationType
  waba_phone_number_id: string | null
  waba_business_account_id: string | null
  waba_access_token: string | null
  qualifier_agent_id: string | null
  created_at: string
  updated_at: string
}

export type AIAgent = {
  id: string
  user_id: string
  team_id: string | null
  name: string
  description: string | null
  system_prompt: string
  objective: string | null
  model: string
  temperature: number
  response_delay_min: number
  response_delay_max: number
  max_messages_per_conversation: number | null
  inactivity_timeout_minutes: number | null
  is_active: boolean
  schedule_enabled: boolean
  schedule_timezone: string
  schedule_start_time: string
  schedule_end_time: string
  schedule_days: number[]
  auto_detect_language: boolean
  escalation_enabled: boolean
  escalation_mode: 'keywords' | 'ai' | 'both'
  escalation_keywords: string[]
  escalation_message: string | null
  booking_url: string | null
  agent_type: 'conversation' | 'relance' | 'qualifier'
  stop_condition: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export type WALink = {
  id: string
  user_id: string
  team_id: string | null
  session_id: string
  ai_agent_id: string | null
  name: string
  slug: string | null
  pre_filled_message: string | null
  tracking_source: string | null
  click_count: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Contact = {
  id: string
  session_id: string
  phone_number: string
  name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  notes: string | null
  ai_summary: string | null
  ai_summary_updated_at: string | null
  profile_picture: string | null
  created_at: string
  updated_at: string
}

export type Conversation = {
  id: string
  session_id: string
  contact_id: string
  ai_agent_id: string | null
  wa_link_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  is_ai_active: boolean
  is_pinned: boolean
  lifecycle_stage_id: string | null
  lifecycle_last_analyzed_at: string | null
  lifecycle_messages_since_analysis: number
  created_at: string
  updated_at: string
}

export type Message = {
  id: string
  conversation_id: string
  session_id: string
  direction: 'inbound' | 'outbound'
  content: string | null
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
  media_url: string | null
  media_mime_type: string | null
  transcription: string | null
  wa_message_id: string | null
  sent_by: 'user' | 'ai_agent' | 'contact'
  ai_agent_id: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  reaction_emoji: string | null
  ai_processed: boolean
  created_at: string
}

export type KnowledgeDocument = {
  id: string
  user_id: string
  team_id: string | null
  name: string
  description: string | null
  doc_type: 'pdf' | 'text'
  text_content: string | null
  storage_path: string | null
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message: string | null
  chunk_count: number
  char_count: number
  created_at: string
  updated_at: string
}

export type KnowledgeChunk = {
  id: string
  document_id: string
  user_id: string
  chunk_index: number
  content: string
  token_count: number | null
  created_at: string
}

export type AgentKnowledgeDocument = {
  id: string
  agent_id: string
  document_id: string
  created_at: string
}

export type AgentToolType = 'google_calendar' | 'google_gmail' | 'whatsapp_message' | 'shopify' | 'woocommerce' | 'stripe' | 'google_sheets' | 'distance_calculator' | 'app_notification' | 'custom'
export type ToolPermission = 'read' | 'write' | 'read_write'

export type AgentTool = {
  id: string
  agent_id: string
  user_id: string
  tool_type: AgentToolType
  name: string
  description: string
  config: Record<string, unknown>
  permissions: ToolPermission
  is_active: boolean
  rate_limit: number
  credential_id: string | null
  created_at: string
  updated_at: string
}

export type CredentialType = 'oauth2' | 'api_key' | 'basic' | 'bearer'

export type OAuthCredential = {
  id: string
  user_id: string
  team_id: string | null
  name: string
  provider: string
  credential_type: CredentialType
  client_id: string | null
  client_secret: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  scopes: string | null
  metadata: Record<string, unknown>
  is_connected: boolean
  created_at: string
  updated_at: string
}

export type ToolExecutionLog = {
  id: string
  agent_id: string
  tool_id: string
  user_id: string
  conversation_id: string | null
  function_name: string
  parameters: Record<string, unknown> | null
  result: Record<string, unknown> | null
  status: 'success' | 'error' | 'denied' | 'rate_limited' | 'timeout'
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

export type ConversationTag = {
  id: string
  user_id: string
  team_id: string | null
  name: string
  color: string
  created_at: string
}

export type ConversationTagAssignment = {
  id: string
  conversation_id: string
  tag_id: string
  created_at: string
}

export type StatDaily = {
  id: string
  user_id: string
  session_id: string | null
  ai_agent_id: string | null
  wa_link_id: string | null
  date: string
  messages_sent: number
  messages_received: number
  conversations_started: number
  response_rate: number | null
  avg_response_time_seconds: number | null
}

export type WebhookLog = {
  id: string
  session_id: string | null
  event_type: string
  instance_name: string
  payload: Record<string, unknown> | null
  status: 'success' | 'error' | 'skipped'
  error_message: string | null
  processing_time_ms: number | null
  created_at: string
}

export type UserAlert = {
  id: string
  user_id: string
  alert_type: 'session_disconnected' | 'quota_reached' | 'ai_error' | 'webhook_error' | 'info' | 'campaign_opt_out' | 'agent_started' | 'agent_stopped' | 'booking_click' | 'token_limit_reached'
  title: string
  message: string
  metadata: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

export type BookingLinkClick = {
  id: string
  agent_id: string
  conversation_id: string | null
  contact_id: string | null
  session_id: string | null
  user_agent: string | null
  ip_hash: string | null
  referer: string | null
  clicked_at: string
  created_at: string
}

export type Team = {
  id: string
  name: string
  slug: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

// Tables de liaison multi-équipes
export type SessionTeam = {
  id: string
  session_id: string
  team_id: string
  created_at: string
}

export type AgentTeam = {
  id: string
  agent_id: string
  team_id: string
  created_at: string
}

export type DocumentTeam = {
  id: string
  document_id: string
  team_id: string
  created_at: string
}

export type LinkTeam = {
  id: string
  link_id: string
  team_id: string
  created_at: string
}

export type CampaignTeam = {
  id: string
  campaign_id: string
  team_id: string
  created_at: string
}

export type TeamMember = {
  id: string
  team_id: string
  user_id: string | null
  role: 'owner' | 'admin' | 'member'
  invited_email: string | null
  invitation_token: string | null
  status: 'pending' | 'accepted'
  allowed_session_ids: string[] | null
  allowed_agent_ids: string[] | null
  allowed_link_ids: string[] | null
  allowed_campaign_ids: string[] | null
  created_at: string
}

export type TeamInvitation = {
  id: string
  team_id: string
  code: string
  role: 'admin' | 'member'
  allowed_session_ids: string[] | null
  allowed_agent_ids: string[] | null
  allowed_link_ids: string[] | null
  allowed_campaign_ids: string[] | null
  created_by: string
  used_by: string | null
  used_at: string | null
  expires_at: string | null
  created_at: string
}

// =============================================
// Types Campagnes de relance
// =============================================

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled'

export type Campaign = {
  id: string
  user_id: string
  team_id: string | null
  name: string
  status: CampaignStatus

  // Agent IA pour personnalisation (optionnel, doit être type 'relance')
  relance_agent_id: string | null

  // Agent IA pour les réponses après relance (optionnel, doit être type 'conversation')
  conversation_agent_id: string | null

  // Message template (utilisé si pas d'agent)
  message_template: string | null

  // Filtres de ciblage
  filter_session_ids: string[] | null
  filter_tracking_sources: string[] | null
  filter_tag_ids: string[] | null
  filter_link_ids: string[] | null
  filter_lifecycle_stage_ids: string[] | null
  filter_inactivity_days: number | null
  filter_exclude_replied: boolean

  // Limites anti-ban
  max_recipients: number
  delay_between_min: number
  delay_between_max: number
  messages_per_hour: number
  send_hour_start: number
  send_hour_end: number
  min_response_rate: number
  min_days_since_last_campaign: number

  // Planification
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  paused_at: string | null
  pause_reason: string | null

  // Stats agrégées
  total_recipients: number
  sent_count: number
  delivered_count: number
  replied_count: number
  failed_count: number

  created_at: string
  updated_at: string
}

export type CampaignRecipientStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'delivered' | 'replied' | 'failed' | 'skipped'

export type CampaignRecipient = {
  id: string
  campaign_id: string
  contact_id: string
  conversation_id: string | null
  session_id: string

  status: CampaignRecipientStatus

  // Message envoyé (personnalisé par IA ou template)
  message_sent: string | null

  // Timestamps du cycle de vie
  queued_at: string
  sent_at: string | null
  delivered_at: string | null
  replied_at: string | null

  // Erreur si échec
  error_message: string | null

  created_at: string
}

export type CampaignBlacklistReason = 'opt_out' | 'manual' | 'low_engagement' | 'complained'

export type CampaignBlacklist = {
  id: string
  user_id: string
  contact_id: string
  session_id: string
  reason: CampaignBlacklistReason
  keyword_matched: string | null
  created_at: string
}

export type CampaignOptOutKeyword = {
  id: string
  keyword: string
  created_at: string
}

// =============================================
// Types Lifecycle
// =============================================

export type LifecycleStage = {
  id: string
  user_id: string
  name: string
  color: string
  icon: string | null
  position: number
  description: string | null
  created_at: string
}

export type LifecycleHistory = {
  id: string
  conversation_id: string
  from_stage_id: string | null
  to_stage_id: string | null
  reason: string | null
  changed_by: 'ai' | 'user'
  tokens_used: number
  created_at: string
}

// =============================================
// Types Qualifier (routeur intelligent)
// =============================================

export type QualifierRoute = {
  id: string
  agent_id: string
  target_agent_id: string
  name: string
  description: string
  priority: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// Joined types
export type ConversationWithContact = Conversation & {
  contact: Contact
}

export type MessageWithAgent = Message & {
  ai_agent?: AIAgent | null
}

// Database type for Supabase generic client
// Must match GenericSchema: { Tables, Views, Functions }
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'email'>
        Update: Partial<Profile>
        Relationships: []
      }
      whatsapp_sessions: {
        Row: WhatsAppSession
        Insert: Partial<WhatsAppSession> & Pick<WhatsAppSession, 'user_id' | 'instance_name'>
        Update: Partial<WhatsAppSession>
        Relationships: []
      }
      ai_agents: {
        Row: AIAgent
        Insert: Partial<AIAgent> & Pick<AIAgent, 'user_id' | 'name' | 'system_prompt'>
        Update: Partial<AIAgent>
        Relationships: []
      }
      wa_links: {
        Row: WALink
        Insert: Partial<WALink> & Pick<WALink, 'user_id' | 'session_id' | 'name'>
        Update: Partial<WALink>
        Relationships: []
      }
      contacts: {
        Row: Contact
        Insert: Partial<Contact> & Pick<Contact, 'session_id' | 'phone_number'>
        Update: Partial<Contact>
        Relationships: []
      }
      conversations: {
        Row: Conversation
        Insert: Partial<Conversation> & Pick<Conversation, 'session_id' | 'contact_id'>
        Update: Partial<Conversation>
        Relationships: []
      }
      messages: {
        Row: Message
        Insert: Partial<Message> & Pick<Message, 'conversation_id' | 'session_id' | 'direction'>
        Update: Partial<Message>
        Relationships: []
      }
      stats_daily: {
        Row: StatDaily
        Insert: Partial<StatDaily> & Pick<StatDaily, 'user_id' | 'date'>
        Update: Partial<StatDaily>
        Relationships: []
      }
      knowledge_documents: {
        Row: KnowledgeDocument
        Insert: Partial<KnowledgeDocument> & Pick<KnowledgeDocument, 'user_id' | 'name'>
        Update: Partial<KnowledgeDocument>
        Relationships: []
      }
      knowledge_chunks: {
        Row: KnowledgeChunk
        Insert: Partial<KnowledgeChunk> & Pick<KnowledgeChunk, 'document_id' | 'user_id' | 'chunk_index' | 'content'>
        Update: Partial<KnowledgeChunk>
        Relationships: []
      }
      agent_knowledge_documents: {
        Row: AgentKnowledgeDocument
        Insert: Partial<AgentKnowledgeDocument> & Pick<AgentKnowledgeDocument, 'agent_id' | 'document_id'>
        Update: Partial<AgentKnowledgeDocument>
        Relationships: []
      }
      agent_tools: {
        Row: AgentTool
        Insert: Partial<AgentTool> & Pick<AgentTool, 'agent_id' | 'user_id' | 'name' | 'description'>
        Update: Partial<AgentTool>
        Relationships: []
      }
      oauth_credentials: {
        Row: OAuthCredential
        Insert: Partial<OAuthCredential> & Pick<OAuthCredential, 'user_id' | 'name'>
        Update: Partial<OAuthCredential>
        Relationships: []
      }
      tool_execution_logs: {
        Row: ToolExecutionLog
        Insert: Partial<ToolExecutionLog> & Pick<ToolExecutionLog, 'agent_id' | 'tool_id' | 'user_id' | 'function_name'>
        Update: Partial<ToolExecutionLog>
        Relationships: []
      }
      conversation_tags: {
        Row: ConversationTag
        Insert: Partial<ConversationTag> & Pick<ConversationTag, 'user_id' | 'name'>
        Update: Partial<ConversationTag>
        Relationships: []
      }
      conversation_tag_assignments: {
        Row: ConversationTagAssignment
        Insert: Partial<ConversationTagAssignment> & Pick<ConversationTagAssignment, 'conversation_id' | 'tag_id'>
        Update: Partial<ConversationTagAssignment>
        Relationships: []
      }
      webhook_logs: {
        Row: WebhookLog
        Insert: Partial<WebhookLog> & Pick<WebhookLog, 'event_type' | 'instance_name'>
        Update: Partial<WebhookLog>
        Relationships: []
      }
      user_alerts: {
        Row: UserAlert
        Insert: Partial<UserAlert> & Pick<UserAlert, 'user_id' | 'alert_type' | 'title' | 'message'>
        Update: Partial<UserAlert>
        Relationships: []
      }
      teams: {
        Row: Team
        Insert: Partial<Team> & Pick<Team, 'name' | 'owner_id'>
        Update: Partial<Team>
        Relationships: []
      }
      team_members: {
        Row: TeamMember
        Insert: Partial<TeamMember> & Pick<TeamMember, 'team_id' | 'role'>
        Update: Partial<TeamMember>
        Relationships: []
      }
      team_invitations: {
        Row: TeamInvitation
        Insert: Partial<TeamInvitation> & Pick<TeamInvitation, 'team_id' | 'code' | 'created_by'>
        Update: Partial<TeamInvitation>
        Relationships: []
      }
      campaigns: {
        Row: Campaign
        Insert: Partial<Campaign> & Pick<Campaign, 'user_id' | 'name'>
        Update: Partial<Campaign>
        Relationships: []
      }
      campaign_recipients: {
        Row: CampaignRecipient
        Insert: Partial<CampaignRecipient> & Pick<CampaignRecipient, 'campaign_id' | 'contact_id' | 'session_id'>
        Update: Partial<CampaignRecipient>
        Relationships: []
      }
      campaign_blacklist: {
        Row: CampaignBlacklist
        Insert: Partial<CampaignBlacklist> & Pick<CampaignBlacklist, 'user_id' | 'contact_id' | 'session_id'>
        Update: Partial<CampaignBlacklist>
        Relationships: []
      }
      campaign_opt_out_keywords: {
        Row: CampaignOptOutKeyword
        Insert: Partial<CampaignOptOutKeyword> & Pick<CampaignOptOutKeyword, 'keyword'>
        Update: Partial<CampaignOptOutKeyword>
        Relationships: []
      }
      lifecycle_stages: {
        Row: LifecycleStage
        Insert: Partial<LifecycleStage> & Pick<LifecycleStage, 'user_id' | 'name'>
        Update: Partial<LifecycleStage>
        Relationships: []
      }
      lifecycle_history: {
        Row: LifecycleHistory
        Insert: Partial<LifecycleHistory> & Pick<LifecycleHistory, 'conversation_id'>
        Update: Partial<LifecycleHistory>
        Relationships: []
      }
      qualifier_routes: {
        Row: QualifierRoute
        Insert: Partial<QualifierRoute> & Pick<QualifierRoute, 'agent_id' | 'target_agent_id' | 'name' | 'description'>
        Update: Partial<QualifierRoute>
        Relationships: []
      }
    }
    Views: {}
    Functions: {
      match_knowledge_chunks: {
        Args: {
          query_embedding: string
          match_document_ids: string[]
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          id: string
          document_id: string
          content: string
          chunk_index: number
          similarity: number
        }[]
      }
      join_team_with_code: {
        Args: {
          p_code: string
        }
        Returns: {
          success?: boolean
          error?: string
          status?: number
          data?: {
            team: { id: string; name: string }
            role: string
            permissions: {
              sessions: string[] | null
              agents: string[] | null
              links: string[] | null
              campaigns: string[] | null
            }
          }
        }
      }
      increment_token_usage: {
        Args: {
          p_user_id: string
          p_tokens: number
        }
        Returns: {
          new_total: number
          token_limit: number
        }[]
      }
      get_campaign_eligible_contacts: {
        Args: {
          p_user_id: string
          p_session_ids?: string[] | null
          p_tracking_sources?: string[] | null
          p_tag_ids?: string[] | null
          p_inactivity_days?: number | null
          p_exclude_replied?: boolean
          p_min_days_since_last_campaign?: number
          p_max_recipients?: number
        }
        Returns: {
          contact_id: string
          conversation_id: string | null
          session_id: string
          phone_number: string
          contact_name: string | null
          last_message_at: string | null
          days_inactive: number
          tracking_source: string | null
        }[]
      }
      check_tool_rate_limit: {
        Args: {
          p_tool_id: string
          p_rate_limit: number
        }
        Returns: boolean
      }
    }
  }
}
