-- Migration: Add reaction_emoji column to messages table
-- Stores emoji reactions on messages (e.g. "👍", "❤️")

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reaction_emoji TEXT DEFAULT NULL;

-- Index for quick lookup of messages with reactions (optional, for future features)
CREATE INDEX IF NOT EXISTS idx_messages_reaction_emoji ON messages (reaction_emoji) WHERE reaction_emoji IS NOT NULL;
