-- ============================================================
-- GRANT EXECUTE sur toutes les fonctions RPC appelées par l'app
-- Ces fonctions ont été recréées sans GRANT après la restauration DB
-- ============================================================

-- Fonctions appelées via supabase.rpc() depuis le code serveur (service_role)
-- et depuis le client authentifié (authenticated)
GRANT EXECUTE ON FUNCTION public.increment_token_usage(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_unread_count(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_click_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, float, int, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_campaign_stats(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_tool_rate_limit(uuid, integer) TO authenticated, service_role;

-- Fonctions appelées depuis le client authenticated
GRANT EXECUTE ON FUNCTION public.join_team_with_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_eligible_contacts(uuid, uuid, text, text[], jsonb, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_campaign(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_team_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_team_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(uuid) TO authenticated, service_role;
