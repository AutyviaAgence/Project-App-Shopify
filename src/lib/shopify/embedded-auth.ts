import 'server-only'
import type { NextRequest } from 'next/server'
import { sessionFromRequest } from './session-token'
import { resolveXeyoUser } from './resolve-user'

/**
 * Auth UNIFIÉE pour les routes API accessibles depuis l'admin Shopify (embedded)
 * ET depuis le dashboard web classique.
 *
 * Ordre de résolution :
 *   1. Session token Shopify (Authorization: Bearer …) → boutique → compte Xeyo
 *      (créé automatiquement à la 1re visite, cf. resolveXeyoUser).
 *   2. Sinon, cookie Supabase (dashboard web, hors iframe).
 *
 * Permet de migrer les routes UNE PAR UNE sans casser l'existant.
 *
 * ⚠️ IMPORTANT : en embedded il n'y a PAS de JWT Supabase → `auth.uid()` est NULL
 * → la RLS ne protège rien. Toute route migrée DOIT filtrer explicitement sur le
 * `userId` renvoyé ici (sinon IDOR).
 */

export type AuthedUser = {
  userId: string
  /** Boutique d'origine si l'appel vient de l'admin Shopify (embedded). */
  shop: string | null
  /** true = authentifié par session token Shopify (pas de cookie). */
  embedded: boolean
}

/** Renvoie l'utilisateur authentifié, ou null (→ la route répond 401). */
export async function getAuthedUser(req: NextRequest): Promise<AuthedUser | null> {
  // 1) Embedded : session token Shopify.
  const session = sessionFromRequest(req)
  if (session) {
    // ⚠️ MANAGED INSTALL : Shopify installe l'app SANS appeler notre callback
    // OAuth — il ouvre directement l'iframe avec un session token. La ligne
    // `shopify_stores` n'est donc jamais créée, et `resolveXeyoUser` renvoyait
    // `null` → « Installation requise » à l'infini.
    // On provisionne donc la boutique ici, par token exchange, à la 1re visite.
    // Sort immédiatement si elle existe déjà (cas de la quasi-totalité des appels).
    const rawToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { ensureStoreProvisioned } = await import('./ensure-store')
    await ensureStoreProvisioned(session.shop, rawToken)

    const resolved = await resolveXeyoUser(session.shop)
    if (resolved) {
      return { userId: resolved.userId, shop: session.shop, embedded: true }
    }
    // Token valide mais provisionnement impossible → pas d'identité.
    return null
  }

  // 2) Web classique : cookie Supabase.
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, shop: null, embedded: false }
}
