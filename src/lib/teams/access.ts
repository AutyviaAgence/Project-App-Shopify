import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Type pour les permissions d'un membre
 */
export type MemberPermissions = {
  team_id: string
  role: 'owner' | 'admin' | 'member'
  allowed_session_ids: string[] | null
  allowed_agent_ids: string[] | null
  allowed_link_ids: string[] | null
  allowed_campaign_ids: string[] | null
  // Permissions granulaires de lecture
  can_view_stats: boolean
  can_view_knowledge: boolean
  can_view_messages: boolean
  // Permissions granulaires de modification
  can_manage_sessions: boolean
  can_manage_agents: boolean
  can_manage_knowledge: boolean
  can_manage_links: boolean
  can_send_messages: boolean
}

/**
 * Types de permissions disponibles
 */
export type PermissionType =
  | 'stats_view'
  | 'knowledge_view'
  | 'messages_view'
  | 'sessions_manage'
  | 'agents_manage'
  | 'knowledge_manage'
  | 'links_manage'
  | 'messages_send'

/**
 * Récupère tous les IDs d'équipes auxquelles l'utilisateur appartient
 */
export async function getUserTeamIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  return (data || []).map((tm) => tm.team_id)
}

/**
 * Récupère les permissions de l'utilisateur dans toutes ses équipes
 */
export async function getUserTeamPermissions(
  supabase: SupabaseClient,
  userId: string
): Promise<MemberPermissions[]> {
  const { data } = await supabase
    .from('team_members')
    .select(`
      team_id, role,
      allowed_session_ids, allowed_agent_ids, allowed_link_ids, allowed_campaign_ids,
      can_view_stats, can_view_knowledge, can_view_messages,
      can_manage_sessions, can_manage_agents, can_manage_knowledge,
      can_manage_links, can_send_messages
    `)
    .eq('user_id', userId)
    .eq('status', 'accepted')

  // Appliquer les valeurs par défaut pour les permissions nulles
  return (data || []).map((m) => ({
    ...m,
    allowed_campaign_ids: m.allowed_campaign_ids ?? null,
    can_view_stats: m.can_view_stats ?? true,
    can_view_knowledge: m.can_view_knowledge ?? true,
    can_view_messages: m.can_view_messages ?? true,
    can_manage_sessions: m.can_manage_sessions ?? false,
    can_manage_agents: m.can_manage_agents ?? false,
    can_manage_knowledge: m.can_manage_knowledge ?? false,
    can_manage_links: m.can_manage_links ?? false,
    can_send_messages: m.can_send_messages ?? true,
  })) as MemberPermissions[]
}

/**
 * Vérifie si l'utilisateur peut accéder à une ressource
 * L'accès est accordé si :
 * - La ressource appartient directement à l'utilisateur (user_id)
 * - La ressource appartient à une équipe dont l'utilisateur est membre (team_id)
 */
export async function canAccessResource(
  supabase: SupabaseClient,
  userId: string,
  resourceUserId: string,
  resourceTeamId: string | null
): Promise<boolean> {
  // Accès direct via user_id
  if (resourceUserId === userId) {
    return true
  }

  // Accès via équipe
  if (resourceTeamId) {
    const teamIds = await getUserTeamIds(supabase, userId)
    return teamIds.includes(resourceTeamId)
  }

  return false
}

/**
 * Récupère le rôle de l'utilisateur dans une équipe
 */
export async function getTeamRole(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<'owner' | 'admin' | 'member' | null> {
  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .single()

  return data?.role ?? null
}

/**
 * Vérifie si l'utilisateur est admin ou owner d'une équipe
 */
export async function isTeamAdmin(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const role = await getTeamRole(supabase, userId, teamId)
  return role === 'owner' || role === 'admin'
}

/**
 * Vérifie si l'utilisateur est le propriétaire d'une équipe
 */
export async function isTeamOwner(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const role = await getTeamRole(supabase, userId, teamId)
  return role === 'owner'
}

/**
 * Construit une condition OR pour filtrer les ressources
 * accessibles par l'utilisateur (ses propres ressources + celles de ses équipes)
 */
export function buildAccessFilter(userId: string, teamIds: string[]): string {
  if (teamIds.length === 0) {
    return `user_id.eq.${userId}`
  }
  return `user_id.eq.${userId},team_id.in.(${teamIds.join(',')})`
}

/**
 * Type pour les ressources avec team_id optionnel
 */
export type TeamResource = {
  user_id: string
  team_id: string | null
}

/**
 * Filtre une liste de ressources pour ne garder que celles accessibles par l'utilisateur
 */
export function filterAccessibleResources<T extends TeamResource>(
  resources: T[],
  userId: string,
  teamIds: string[]
): T[] {
  return resources.filter((r) => {
    if (r.user_id === userId) return true
    if (r.team_id && teamIds.includes(r.team_id)) return true
    return false
  })
}

/**
 * Type pour les ressources avec id
 */
export type ResourceWithId = TeamResource & { id: string }

/**
 * Filtre les sessions selon les permissions granulaires de l'utilisateur
 */
export function filterSessionsByPermissions<T extends ResourceWithId>(
  sessions: T[],
  userId: string,
  permissions: MemberPermissions[]
): T[] {
  return sessions.filter((session) => {
    // Ressource personnelle = accès total
    if (session.user_id === userId) return true

    // Ressource d'équipe
    if (session.team_id) {
      const memberPerm = permissions.find((p) => p.team_id === session.team_id)
      if (!memberPerm) return false

      // Owner et Admin ont accès à tout
      if (memberPerm.role === 'owner' || memberPerm.role === 'admin') return true

      // Pour les membres, vérifier les permissions granulaires
      // null = accès à toutes les sessions de l'équipe
      if (memberPerm.allowed_session_ids === null) return true
      // Sinon, vérifier si la session est dans la liste
      return memberPerm.allowed_session_ids.includes(session.id)
    }

    return false
  })
}

/**
 * Filtre les agents selon les permissions granulaires de l'utilisateur
 */
export function filterAgentsByPermissions<T extends ResourceWithId>(
  agents: T[],
  userId: string,
  permissions: MemberPermissions[]
): T[] {
  return agents.filter((agent) => {
    if (agent.user_id === userId) return true

    if (agent.team_id) {
      const memberPerm = permissions.find((p) => p.team_id === agent.team_id)
      if (!memberPerm) return false

      if (memberPerm.role === 'owner' || memberPerm.role === 'admin') return true

      if (memberPerm.allowed_agent_ids === null) return true
      return memberPerm.allowed_agent_ids.includes(agent.id)
    }

    return false
  })
}

/**
 * Filtre les liens selon les permissions granulaires de l'utilisateur
 */
export function filterLinksByPermissions<T extends ResourceWithId>(
  links: T[],
  userId: string,
  permissions: MemberPermissions[]
): T[] {
  return links.filter((link) => {
    if (link.user_id === userId) return true

    if (link.team_id) {
      const memberPerm = permissions.find((p) => p.team_id === link.team_id)
      if (!memberPerm) return false

      if (memberPerm.role === 'owner' || memberPerm.role === 'admin') return true

      if (memberPerm.allowed_link_ids === null) return true
      return memberPerm.allowed_link_ids.includes(link.id)
    }

    return false
  })
}

/**
 * Filtre les campagnes selon les permissions granulaires de l'utilisateur
 */
export function filterCampaignsByPermissions<T extends ResourceWithId>(
  campaigns: T[],
  userId: string,
  permissions: MemberPermissions[]
): T[] {
  return campaigns.filter((campaign) => {
    if (campaign.user_id === userId) return true

    if (campaign.team_id) {
      const memberPerm = permissions.find((p) => p.team_id === campaign.team_id)
      if (!memberPerm) return false

      if (memberPerm.role === 'owner' || memberPerm.role === 'admin') return true

      if (memberPerm.allowed_campaign_ids === null) return true
      return memberPerm.allowed_campaign_ids.includes(campaign.id)
    }

    return false
  })
}

/**
 * Vérifie si l'utilisateur peut accéder à une session spécifique
 * Prend en compte les permissions granulaires pour les membres
 */
export async function canAccessSession(
  supabase: SupabaseClient,
  userId: string,
  session: { id: string; user_id: string; team_id: string | null }
): Promise<boolean> {
  // Accès direct via user_id
  if (session.user_id === userId) {
    return true
  }

  // Accès via équipe avec permissions granulaires
  if (session.team_id) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role, allowed_session_ids')
      .eq('team_id', session.team_id)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single()

    if (!membership) return false

    // Owner et Admin ont accès à tout
    if (membership.role === 'owner' || membership.role === 'admin') return true

    // Pour les membres, vérifier les permissions granulaires
    // null = accès à toutes les sessions
    if (membership.allowed_session_ids === null) return true

    // Sinon, vérifier si la session est dans la liste
    return membership.allowed_session_ids.includes(session.id)
  }

  return false
}

/**
 * Vérifie si l'utilisateur a une permission spécifique dans une équipe
 */
export async function checkTeamPermission(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
  permission: PermissionType
): Promise<boolean> {
  const { data: membership } = await supabase
    .from('team_members')
    .select(`
      role,
      can_view_stats, can_view_knowledge, can_view_messages,
      can_manage_sessions, can_manage_agents, can_manage_knowledge,
      can_manage_links, can_send_messages
    `)
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .single()

  if (!membership) return false

  // Owner et Admin ont toutes les permissions
  if (membership.role === 'owner' || membership.role === 'admin') {
    return true
  }

  // Pour les membres, vérifier la permission spécifique
  switch (permission) {
    case 'stats_view':
      return membership.can_view_stats ?? true
    case 'knowledge_view':
      return membership.can_view_knowledge ?? true
    case 'messages_view':
      return membership.can_view_messages ?? true
    case 'sessions_manage':
      return membership.can_manage_sessions ?? false
    case 'agents_manage':
      return membership.can_manage_agents ?? false
    case 'knowledge_manage':
      return membership.can_manage_knowledge ?? false
    case 'links_manage':
      return membership.can_manage_links ?? false
    case 'messages_send':
      return membership.can_send_messages ?? true
    default:
      return false
  }
}

/**
 * Récupère toutes les permissions d'un utilisateur dans une équipe
 */
export async function getTeamMemberPermissions(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<MemberPermissions | null> {
  const { data } = await supabase
    .from('team_members')
    .select(`
      team_id, role,
      allowed_session_ids, allowed_agent_ids, allowed_link_ids, allowed_campaign_ids,
      can_view_stats, can_view_knowledge, can_view_messages,
      can_manage_sessions, can_manage_agents, can_manage_knowledge,
      can_manage_links, can_send_messages
    `)
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .single()

  if (!data) return null

  return {
    ...data,
    allowed_campaign_ids: data.allowed_campaign_ids ?? null,
    can_view_stats: data.can_view_stats ?? true,
    can_view_knowledge: data.can_view_knowledge ?? true,
    can_view_messages: data.can_view_messages ?? true,
    can_manage_sessions: data.can_manage_sessions ?? false,
    can_manage_agents: data.can_manage_agents ?? false,
    can_manage_knowledge: data.can_manage_knowledge ?? false,
    can_manage_links: data.can_manage_links ?? false,
    can_send_messages: data.can_send_messages ?? true,
  } as MemberPermissions
}

/**
 * Vérifie si l'utilisateur peut accéder à une campagne spécifique
 * Prend en compte les permissions granulaires pour les membres
 */
export async function canAccessCampaign(
  supabase: SupabaseClient,
  userId: string,
  campaign: { id: string; user_id: string; team_id: string | null }
): Promise<boolean> {
  // Accès direct via user_id
  if (campaign.user_id === userId) {
    return true
  }

  // Accès via équipe avec permissions granulaires
  if (campaign.team_id) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role, allowed_campaign_ids')
      .eq('team_id', campaign.team_id)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single()

    if (!membership) return false

    // Owner et Admin ont accès à tout
    if (membership.role === 'owner' || membership.role === 'admin') return true

    // Pour les membres, vérifier les permissions granulaires
    // null = accès à toutes les campagnes
    if (membership.allowed_campaign_ids === null) return true

    // Sinon, vérifier si la campagne est dans la liste
    return membership.allowed_campaign_ids.includes(campaign.id)
  }

  return false
}
