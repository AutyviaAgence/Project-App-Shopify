-- ============================================================================
-- Migration: Add missing indexes on foreign keys
-- Fixes 21 unindexed_foreign_keys advisor warnings
-- ============================================================================

-- booking_link_clicks
CREATE INDEX IF NOT EXISTS idx_booking_link_clicks_contact_id ON booking_link_clicks(contact_id);
CREATE INDEX IF NOT EXISTS idx_booking_link_clicks_session_id ON booking_link_clicks(session_id);

-- booking_proposals
CREATE INDEX IF NOT EXISTS idx_booking_proposals_contact_id ON booking_proposals(contact_id);
CREATE INDEX IF NOT EXISTS idx_booking_proposals_message_id ON booking_proposals(message_id);
CREATE INDEX IF NOT EXISTS idx_booking_proposals_session_id ON booking_proposals(session_id);

-- campaign_recipients
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_conversation_id ON campaign_recipients(conversation_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_session_id ON campaign_recipients(session_id);

-- campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_conversation_agent_id ON campaigns(conversation_agent_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_relance_agent_id ON campaigns(relance_agent_id);

-- conversation_tag_assignments
CREATE INDEX IF NOT EXISTS idx_conversation_tag_assignments_tag_id ON conversation_tag_assignments(tag_id);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_ai_agent_id ON conversations(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_wa_link_id ON conversations(wa_link_id);

-- lifecycle_history
CREATE INDEX IF NOT EXISTS idx_lifecycle_history_from_stage_id ON lifecycle_history(from_stage_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_history_to_stage_id ON lifecycle_history(to_stage_id);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_ai_agent_id ON messages(ai_agent_id);

-- stats_daily
CREATE INDEX IF NOT EXISTS idx_stats_daily_ai_agent_id ON stats_daily(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_stats_daily_session_id ON stats_daily(session_id);
CREATE INDEX IF NOT EXISTS idx_stats_daily_wa_link_id ON stats_daily(wa_link_id);

-- team_invitations
CREATE INDEX IF NOT EXISTS idx_team_invitations_created_by ON team_invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_team_invitations_used_by ON team_invitations(used_by);

-- tool_execution_logs
CREATE INDEX IF NOT EXISTS idx_tool_execution_logs_conversation_id ON tool_execution_logs(conversation_id);

-- wa_links
CREATE INDEX IF NOT EXISTS idx_wa_links_ai_agent_id ON wa_links(ai_agent_id);
