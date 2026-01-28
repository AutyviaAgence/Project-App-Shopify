export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type WhatsAppSession = {
  id: string
  user_id: string
  team_id: string | null
  instance_name: string
  instance_id: string | null
  status: 'connected' | 'disconnected' | 'qr_pending' | 'error'
  qr_code: string | null
  phone_number: string | null
  daily_ai_message_limit: number | null
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
  wa_message_id: string | null
  sent_by: 'user' | 'ai_agent' | 'contact'
  ai_agent_id: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
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
  alert_type: 'session_disconnected' | 'quota_reached' | 'ai_error' | 'webhook_error' | 'info'
  title: string
  message: string
  metadata: Record<string, unknown> | null
  is_read: boolean
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
  created_by: string
  used_by: string | null
  used_at: string | null
  expires_at: string | null
  created_at: string
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
            }
          }
        }
      }
    }
  }
}
