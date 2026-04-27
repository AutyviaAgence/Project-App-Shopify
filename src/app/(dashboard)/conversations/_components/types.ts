import type { Message, AIAgent, ConversationTag, LifecycleStage } from '@/types/database'

export type ConversationWithJoins = {
  id: string
  session_id: string | null
  email_session_id?: string | null
  channel?: 'whatsapp' | 'email'
  contact_id: string
  ai_agent_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  is_ai_active: boolean
  is_pinned: boolean
  lifecycle_stage_id: string | null
  created_at: string
  contact: {
    id: string
    phone_number: string
    email?: string | null
    name: string | null
    first_name: string | null
    last_name: string | null
    profile_picture: string | null
  } | null
  session: {
    id: string
    instance_name: string
    phone_number: string | null
    team_id: string | null
    team_name: string | null
  }
  tags?: ConversationTag[]
}

export type Team = {
  id: string
  name: string
}

export type { Message, AIAgent, ConversationTag, LifecycleStage }
