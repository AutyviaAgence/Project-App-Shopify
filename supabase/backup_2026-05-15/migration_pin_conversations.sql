-- Migration: Add is_pinned column to conversations
-- Run this in Supabase SQL Editor

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Composite index for sorting: pinned first, then by last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(is_pinned DESC, last_message_at DESC);
