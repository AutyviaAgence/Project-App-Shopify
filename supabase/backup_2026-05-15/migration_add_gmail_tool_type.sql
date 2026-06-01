-- Add google_gmail to the tool_type CHECK constraint on agent_tools
ALTER TABLE public.agent_tools DROP CONSTRAINT IF EXISTS agent_tools_tool_type_check;
ALTER TABLE public.agent_tools ADD CONSTRAINT agent_tools_tool_type_check
  CHECK (tool_type IN ('google_calendar', 'google_gmail', 'shopify', 'woocommerce', 'stripe', 'google_sheets', 'custom'));
