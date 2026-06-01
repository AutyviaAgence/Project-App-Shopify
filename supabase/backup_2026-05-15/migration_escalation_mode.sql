-- Add escalation_mode column to ai_agents
-- Allows choosing between keyword matching, AI detection, or both
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS escalation_mode TEXT DEFAULT 'keywords'
  CHECK (escalation_mode IN ('keywords', 'ai', 'both'));
