-- Migration: Agent Tools (Function Calling)
-- Allows AI agents to call external APIs (Google Calendar, Shopify, Stripe, custom APIs)

-- ============================================================
-- Table: agent_tools
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL DEFAULT 'custom' CHECK (tool_type IN ('google_calendar', 'shopify', 'woocommerce', 'stripe', 'google_sheets', 'custom')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',  -- encrypted credentials + endpoint config
  permissions TEXT NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'write', 'read_write')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit INTEGER NOT NULL DEFAULT 60,  -- max calls per hour
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agent_tools IS 'External API tools linked to AI agents for function calling';
COMMENT ON COLUMN agent_tools.config IS 'JSONB config with encrypted credentials, endpoints, and function definitions';
COMMENT ON COLUMN agent_tools.permissions IS 'read = query only, write = can modify, read_write = both';
COMMENT ON COLUMN agent_tools.rate_limit IS 'Maximum API calls per hour for this tool';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_user_id ON agent_tools(user_id);

-- ============================================================
-- Table: tool_execution_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS tool_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  function_name TEXT NOT NULL,
  parameters JSONB,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'denied', 'rate_limited', 'timeout')),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tool_execution_logs IS 'Logs of every tool execution by AI agents';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tool_logs_agent_id ON tool_execution_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_tool_id ON tool_execution_logs(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_user_id ON tool_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_created_at ON tool_execution_logs(created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_logs ENABLE ROW LEVEL SECURITY;

-- agent_tools: users can manage their own tools
CREATE POLICY "agent_tools_select" ON agent_tools FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "agent_tools_insert" ON agent_tools FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "agent_tools_update" ON agent_tools FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "agent_tools_delete" ON agent_tools FOR DELETE USING (user_id = auth.uid());

-- tool_execution_logs: users can view their own logs
CREATE POLICY "tool_logs_select" ON tool_execution_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tool_logs_insert" ON tool_execution_logs FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RPC: Check rate limit for a tool (atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION check_tool_rate_limit(p_tool_id UUID, p_rate_limit INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  call_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO call_count
  FROM tool_execution_logs
  WHERE tool_id = p_tool_id
    AND created_at > NOW() - INTERVAL '1 hour'
    AND status IN ('success', 'error');

  RETURN call_count < p_rate_limit;
END;
$$;
