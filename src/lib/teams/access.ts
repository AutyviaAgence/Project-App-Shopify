import { SupabaseClient } from '@supabase/supabase-js'

/**
 * ⚠️ SYSTÈME D'ÉQUIPES RETIRÉ (refonte V2).
 *
 * Ce module ne contient plus que des STUBS conservant les signatures
 * d'origine pour ne pas casser les ~40 fichiers qui les importent.
 * Tout est désormais scopé par utilisateur (user_id only) :
 *   - getUserTeamIds → []
 *   - buildAccessFilter → user_id uniquement
 *   - filter*ByPermissions → ne garde que les ressources de l'utilisateur
 *   - canAccess* / checkTeamPermission → propriétaire uniquement
 *
 * À terme, ces helpers pourront être supprimés et leurs appels remplacés
 * par un simple filtre `user_id = auth.uid()`.
 */

export type MemberPermissions = {
  team_id: string
  role: 'owner' | 'admin' | 'member'
  allowed_session_ids: string[] | null
  allowed_agent_ids: string[] | null
  allowed_link_ids: string[] | null
  allowed_campaign_ids: string[] | null
  can_view_stats: boolean
  can_view_knowledge: boolean
  can_view_messages: boolean
  can_manage_sessions: boolean
  can_manage_agents: boolean
  can_manage_knowledge: boolean
  can_manage_links: boolean
  can_send_messages: boolean
}

export type PermissionType =
  | 'stats_view'
  | 'knowledge_view'
  | 'messages_view'
  | 'sessions_manage'
  | 'agents_manage'
  | 'knowledge_manage'
  | 'links_manage'
  | 'messages_send'

/** Plus d'équipes : aucun team_id. */
export async function getUserTeamIds(
  _supabase: SupabaseClient,
  _userId: string
): Promise<string[]> {
  return []
}

/** Plus d'équipes : aucune permission d'équipe. */
export async function getUserTeamPermissions(
  _supabase: SupabaseClient,
  _userId: string
): Promise<MemberPermissions[]> {
  return []
}

/** Accès uniquement si la ressource appartient à l'utilisateur. */
export async function canAccessResource(
  _supabase: SupabaseClient,
  userId: string,
  resourceUserId: string,
  _resourceTeamId: string | null
): Promise<boolean> {
  return resourceUserId === userId
}

export async function getTeamRole(
  _supabase: SupabaseClient,
  _userId: string,
  _teamId: string
): Promise<'owner' | 'admin' | 'member' | null> {
  return null
}

export async function isTeamAdmin(
  _supabase: SupabaseClient,
  _userId: string,
  _teamId: string
): Promise<boolean> {
  return false
}

export async function isTeamOwner(
  _supabase: SupabaseClient,
  _userId: string,
  _teamId: string
): Promise<boolean> {
  return false
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Filtre PostgREST : uniquement les ressources de l'utilisateur. */
export function buildAccessFilter(userId: string, _teamIds: string[]): string {
  if (!UUID_RE.test(userId)) throw new Error('Invalid userId format')
  return `user_id.eq.${userId}`
}

export type TeamResource = {
  user_id: string
  team_id: string | null
}

export function filterAccessibleResources<T extends TeamResource>(
  resources: T[],
  userId: string,
  _teamIds: string[]
): T[] {
  return resources.filter((r) => r.user_id === userId)
}

export type ResourceWithId = TeamResource & { id: string }

export function filterSessionsByPermissions<T extends ResourceWithId>(
  sessions: T[],
  userId: string,
  _permissions: MemberPermissions[]
): T[] {
  return sessions.filter((s) => s.user_id === userId)
}

export function filterAgentsByPermissions<T extends ResourceWithId>(
  agents: T[],
  userId: string,
  _permissions: MemberPermissions[]
): T[] {
  return agents.filter((a) => a.user_id === userId)
}

export function filterLinksByPermissions<T extends ResourceWithId>(
  links: T[],
  userId: string,
  _permissions: MemberPermissions[]
): T[] {
  return links.filter((l) => l.user_id === userId)
}

export function filterCampaignsByPermissions<T extends ResourceWithId>(
  campaigns: T[],
  userId: string,
  _permissions: MemberPermissions[]
): T[] {
  return campaigns.filter((c) => c.user_id === userId)
}

export async function canAccessSession(
  _supabase: SupabaseClient,
  userId: string,
  session: { id: string; user_id: string; team_id: string | null }
): Promise<boolean> {
  return session.user_id === userId
}

export async function checkTeamPermission(
  _supabase: SupabaseClient,
  _userId: string,
  _teamId: string,
  _permission: PermissionType
): Promise<boolean> {
  return false
}

export async function getTeamMemberPermissions(
  _supabase: SupabaseClient,
  _userId: string,
  _teamId: string
): Promise<MemberPermissions | null> {
  return null
}

export async function canAccessCampaign(
  _supabase: SupabaseClient,
  userId: string,
  campaign: { id: string; user_id: string; team_id: string | null }
): Promise<boolean> {
  return campaign.user_id === userId
}
