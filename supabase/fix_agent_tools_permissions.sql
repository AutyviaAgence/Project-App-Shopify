-- Fix: Grant service_role access to agent_tools and tool_execution_logs
-- The service_role should bypass RLS, but it also needs table-level GRANT permissions.
-- Without these grants, the service role key gets "permission denied for table agent_tools".

-- Grant full access to service_role (used by server-side admin client)
GRANT ALL ON agent_tools TO service_role;
GRANT ALL ON tool_execution_logs TO service_role;

-- Also grant to authenticated role (used by authenticated user clients)
GRANT ALL ON agent_tools TO authenticated;
GRANT ALL ON tool_execution_logs TO authenticated;

-- Ensure RLS is NOT forced for table owner (service_role should bypass RLS)
-- FORCE ROW LEVEL SECURITY would make even table owners subject to RLS — we do NOT want that
ALTER TABLE agent_tools NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_logs NO FORCE ROW LEVEL SECURITY;
