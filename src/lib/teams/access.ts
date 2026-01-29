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
}

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
    .select('team_id, role, allowed_session_ids, allowed_agent_ids, allowed_link_ids')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  return (data || []) as MemberPermissions[]
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
