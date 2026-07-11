import 'server-only'
import { tierValue } from './quality'

/**
 * Garde-fous d'ENVOI face aux limites Meta, appliqués AVANT d'envoyer (et pas
 * seulement en réaction à un rejet). Deux protections :
 *
 *  1. Palier d'envoi 24h : Meta plafonne le nombre de contacts UNIQUES joignables
 *     par 24h (TIER_250/1K/10K…). Dépasser dégrade la qualité → réduit le palier.
 *  2. Fréquence marketing par contact : éviter de sur-solliciter un même contact
 *     (plusieurs campagnes/funnels le même jour), ce qui génère blocages et
 *     signalements — donc, là encore, une chute de qualité.
 *
 * Best-effort : en cas d'erreur DB, on n'empêche jamais l'envoi (fail-open) —
 * ces garde-fous protègent la qualité, ils ne doivent pas casser la messagerie.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Contacts uniques déjà joints (envois marketing) sur les 24h glissantes. */
async function uniqueContactsLast24h(admin: Admin, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data } = await admin
    .from('automation_jobs')
    .select('contact_id')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('processed_at', since)
    .limit(10000)
  return new Set((data || []).map((j: { contact_id: string }) => j.contact_id).filter(Boolean)).size
}

export type TierHeadroom = {
  /** Palier atteint (null = illimité/inconnu → pas de plafond appliqué). */
  limit: number | null
  used: number
  /** Places restantes sous le palier (Infinity si illimité/inconnu). */
  remaining: number
  /** true si on est AU-DELÀ du palier → il faut différer l'envoi. */
  exceeded: boolean
}

/**
 * Calcule la marge restante sous le palier d'envoi 24h de l'utilisateur.
 * `tier` = messaging_limit_tier de la session (ex. 'TIER_1K').
 */
export async function tierHeadroom(admin: Admin, userId: string, tier: string | null): Promise<TierHeadroom> {
  const limit = tier ? (tierValue(tier) || null) : null
  // TIER_UNLIMITED vaut 1e9 dans tierValue → traité comme illimité en pratique.
  if (!limit || limit >= 1e9) return { limit: null, used: 0, remaining: Infinity, exceeded: false }
  try {
    const used = await uniqueContactsLast24h(admin, userId)
    const remaining = Math.max(0, limit - used)
    return { limit, used, remaining, exceeded: used >= limit }
  } catch {
    return { limit, used: 0, remaining: Infinity, exceeded: false } // fail-open
  }
}

/**
 * Vrai si ce contact a DÉJÀ reçu un envoi (marketing) dans les `hours` dernières
 * heures — sert de plafond de fréquence par contact. Basé sur automation_jobs
 * (envois réels). fail-open (false) en cas d'erreur.
 */
export async function contactMessagedWithin(
  admin: Admin, userId: string, contactId: string, hours: number,
): Promise<boolean> {
  if (!contactId || hours <= 0) return false
  try {
    const since = new Date(Date.now() - hours * 3600_000).toISOString()
    const { count } = await admin
      .from('automation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('status', 'sent')
      .gte('processed_at', since)
    return (count ?? 0) > 0
  } catch {
    return false // fail-open
  }
}
