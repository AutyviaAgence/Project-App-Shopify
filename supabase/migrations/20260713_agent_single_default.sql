-- =====================================================================
--  MIGRATION — Un seul agent « par défaut » (référent) par utilisateur
--  Date : 2026-07-13
--
--  Contexte : le webhook assigne l'agent référent via is_default=true avec un
--  maybeSingle() → s'il y a PLUSIEURS is_default pour un user, maybeSingle
--  renvoie null et AUCUN agent n'est assigné (stats agent à 0, IA muette). On
--  garantit ici l'unicité au niveau base.
-- =====================================================================

BEGIN;

-- Au cas où des doublons de default subsistent : ne garder qu'UN default par
-- user (le plus ancien), déclasser les autres.
with ranked as (
  select id, user_id,
    row_number() over (partition by user_id order by created_at asc) as rn
  from ai_agents
  where is_default = true
)
update ai_agents ag
set is_default = false
from ranked r
where ag.id = r.id and r.rn > 1;

-- Index unique partiel : au plus une ligne is_default=true par user.
create unique index if not exists ux_ai_agents_one_default_per_user
  on ai_agents (user_id) where is_default = true;

COMMIT;

NOTIFY pgrst, 'reload schema';
