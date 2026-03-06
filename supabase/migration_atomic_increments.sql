-- Atomic increment for unread_count (avoids race conditions on concurrent webhook calls)
CREATE OR REPLACE FUNCTION increment_unread_count(
  p_conversation_id UUID,
  p_last_message_at TIMESTAMPTZ,
  p_last_message_preview TEXT
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE conversations
  SET unread_count = COALESCE(unread_count, 0) + 1,
      last_message_at = p_last_message_at,
      last_message_preview = p_last_message_preview
  WHERE id = p_conversation_id;
$$;

-- Atomic increment for wa_links click_count
CREATE OR REPLACE FUNCTION increment_click_count(
  p_link_id UUID
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE wa_links
  SET click_count = COALESCE(click_count, 0) + 1
  WHERE id = p_link_id;
$$;
