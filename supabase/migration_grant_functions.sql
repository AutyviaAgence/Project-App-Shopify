-- ============================================================
-- GRANT EXECUTE sur toutes les fonctions RPC appelées par l'app
-- Ces fonctions ont été recréées sans GRANT après la restauration DB
-- ============================================================

GRANT EXECUTE ON FUNCTION public.increment_token_usage(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_unread_count(uuid, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_click_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, uuid[], float, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_campaign_stats(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_tool_rate_limit(uuid, integer) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.join_team_with_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_campaign(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_team_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_team_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_eligible_contacts(uuid, uuid[], text[], uuid[], integer, boolean, integer, integer, uuid[]) TO authenticated, service_role;
