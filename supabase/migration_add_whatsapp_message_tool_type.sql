-- Add whatsapp_message to the tool_type CHECK constraint on agent_tools
-- (also includes google_gmail in case previous migration wasn't run)
ALTER TABLE public.agent_tools DROP CONSTRAINT IF EXISTS agent_tools_tool_type_check;
ALTER TABLE public.agent_tools ADD CONSTRAINT agent_tools_tool_type_check
  CHECK (tool_type IN ('google_calendar', 'google_gmail', 'shopify', 'woocommerce', 'stripe', 'google_sheets', 'whatsapp_message', 'custom'));
