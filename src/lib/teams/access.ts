import { SupabaseClient } from '@supabase/supabase-js'

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
