-- Fix: Grant service_role DELETE permission on oauth_credentials and agent_tools
-- The service_role key needs explicit GRANT to delete rows (bypassing RLS).
-- Without this, even the service role gets "permission denied for table".

-- oauth_credentials
GRANT ALL ON public.oauth_credentials TO service_role;
GRANT ALL ON public.oauth_credentials TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_credentials TO authenticated;

-- agent_tools
GRANT ALL ON public.agent_tools TO service_role;
GRANT ALL ON public.agent_tools TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tools TO authenticated;

-- tool_execution_logs (referenced by agent_tools FK)
GRANT ALL ON public.tool_execution_logs TO service_role;
GRANT ALL ON public.tool_execution_logs TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tool_execution_logs TO authenticated;
