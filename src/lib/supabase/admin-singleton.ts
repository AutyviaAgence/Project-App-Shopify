import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase admin (service-role) RÉUTILISÉ pour tout le process.
 *
 * Pourquoi : instancier `createClient(...)` à chaque requête crée un nouveau
 * client HTTP + négociation de connexion Postgres (~50-100 ms) et épuise le pool
 * de connexions en charge. Un singleton par process réutilise le même client
 * (donc le même keep-alive HTTP), ce qui réduit la latence et surtout ne sature
 * plus le pool sur le hot path (webhook WhatsApp, réponses IA, cron automations).
 *
 * Le client admin ne dépend d'AUCUN état par requête (pas de cookies, pas de
 * session utilisateur) → il est sûr de le partager entre requêtes.
 */
// NB : client NON typé (comme les anciens `createClient(...)` par requête) pour
// rester un drop-in exact. Le type Database généré est incomplet (tables
// automation_jobs, colonnes campaigns…), un client typé casserait des requêtes
// existantes. On garde donc le comportement historique.
let cached: SupabaseClient | null = null

export function getAdminSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
  }
  return cached
}
