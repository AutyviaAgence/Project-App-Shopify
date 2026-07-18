import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * IMPERSONATION ADMIN — résolution de l'utilisateur EFFECTIF.
 *
 * ── LE MODÈLE DE SÉCURITÉ ────────────────────────────────────────────────────
 *
 * On ne remplace JAMAIS la session d'auth (le JWT reste celui de l'admin). À la
 * place, un cookie `impersonate_uid` désigne l'utilisateur cible. Mais ce cookie
 * n'est PAS cru sur parole : il n'est honoré que si, EN BASE, il existe une
 * session d'impersonation ACTIVE (admin_impersonation_log, ended_at IS NULL)
 * ouverte PAR CET ADMIN POUR CETTE CIBLE.
 *
 * Conséquence : un cookie forgé est inutile. Seule la route start (service_role)
 * peut créer la ligne qui l'autorise. On revalide à CHAQUE requête — donc « stop »
 * (qui ferme la ligne) coupe l'impersonation instantanément, même si le cookie
 * traîne encore.
 *
 * En cas de doute (pas admin, pas de ligne active, cible ≠ cookie…), on retombe
 * TOUJOURS sur l'utilisateur réel. Le défaut est sûr.
 */

export const IMPERSONATION_COOKIE = 'impersonate_uid'

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type EffectiveUser = {
  /** L'id à utiliser pour lire/écrire les données (impersonné si actif, sinon réel). */
  id: string
  /** L'admin réellement connecté (= id si pas d'impersonation). */
  realUserId: string
  /** Vrai quand une impersonation est active et validée en base. */
  isImpersonating: boolean
  /** L'utilisateur réel est-il admin ? (utile pour l'UI/gardes) */
  isAdmin: boolean
}

/**
 * Renvoie l'utilisateur EFFECTIF (impersonné si une session valide est active).
 * `null` si personne n'est authentifié.
 *
 * ⚠️ À utiliser PARTOUT où on utilisait `user.id` pour scoper les données d'un
 * marchand. `getEffectiveUser().id` = le bon id, impersonation comprise.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const realUserId = user.id

  // L'utilisateur réel est-il admin ? (une impersonation n'est possible que pour
  // un admin, et on le sait pour l'UI.)
  const { data: prof } = await supabase
    .from('profiles').select('role').eq('id', realUserId).maybeSingle()
  const isAdmin = (prof as { role?: string } | null)?.role === 'admin'

  const cookieStore = await cookies()
  const targetId = cookieStore.get(IMPERSONATION_COOKIE)?.value

  // Pas de cookie, ou pas admin → on est soi-même.
  if (!targetId || !isAdmin) {
    return { id: realUserId, realUserId, isImpersonating: false, isAdmin }
  }

  // Le cookie n'est cru QUE s'il correspond à une session active en base.
  const { data: active } = await admin()
    .from('admin_impersonation_log')
    .select('id')
    .eq('admin_id', realUserId)
    .eq('target_user_id', targetId)
    .is('ended_at', null)
    .maybeSingle()

  if (!active) {
    // Cookie sans session active (forgé, ou session déjà fermée par « stop »).
    return { id: realUserId, realUserId, isImpersonating: false, isAdmin }
  }

  return { id: targetId, realUserId, isImpersonating: true, isAdmin }
}

/**
 * Raccourci quand on ne veut que l'id effectif (le plus fréquent).
 * `null` si non authentifié.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  return (await getEffectiveUser())?.id ?? null
}

/**
 * ⚠️ LE CLIENT À UTILISER POUR LIRE/ÉCRIRE LES DONNÉES DU MARCHAND EFFECTIF.
 *
 * Les routes utilisent le client Supabase à JWT utilisateur, dont les policies
 * RLS scopent par `auth.uid()` = l'ADMIN réel. En impersonation, ce JWT ne permet
 * PAS de lire les données de la cible (RLS les bloque). Il faut donc :
 *   - hors impersonation : le client normal (RLS = soi-même), rien ne change ;
 *   - en impersonation : le client ADMIN (service_role, bypass RLS) scopé
 *     EXPLICITEMENT par l'id effectif.
 *
 * Renvoie { supabase, userId, isImpersonating } — `userId` est TOUJOURS l'id à
 * mettre dans les filtres `.eq('user_id', userId)`. `null` si non authentifié.
 *
 * ⚠️ En impersonation, le scoping n'est plus garanti par RLS mais par TOI : tu
 * DOIS filtrer par `userId`. C'est la contrepartie du bypass. Ne fais jamais une
 * requête non filtrée avec ce client en mode impersonation.
 */
export async function getScopedClient(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; isImpersonating: boolean }
  | null
> {
  const eff = await getEffectiveUser()
  if (!eff) return null

  if (!eff.isImpersonating) {
    // Cas normal : client RLS, scopé par soi-même.
    const supabase = await createClient()
    return { supabase, userId: eff.id, isImpersonating: false }
  }

  // Impersonation : client service_role (bypass RLS), scoping explicite par
  // l'appelant via `userId`.
  const svc = admin() as unknown as Awaited<ReturnType<typeof createClient>>
  return { supabase: svc, userId: eff.id, isImpersonating: true }
}

/**
 * Garde pour les ACTIONS DESTRUCTRICES / IRRÉVERSIBLES.
 *
 * En mode impersonation, on interdit ce qu'un admin ne doit pas pouvoir faire
 * « à la place » d'un client par erreur : supprimer son compte, changer son
 * email/mot de passe, résilier son abonnement. Le marchand l'a demandé.
 *
 * Renvoie une NextResponse 403 à retourner tel quel si on impersonne, sinon null
 * (l'appelant continue). Usage :
 *   const blocked = await blockIfImpersonating()
 *   if (blocked) return blocked
 */
export async function blockIfImpersonating(): Promise<import('next/server').NextResponse | null> {
  const eff = await getEffectiveUser()
  if (eff?.isImpersonating) {
    const { NextResponse } = await import('next/server')
    return NextResponse.json(
      { error: 'Action indisponible en mode impersonation. Revenez à votre compte admin pour l’effectuer.' },
      { status: 403 }
    )
  }
  return null
}
