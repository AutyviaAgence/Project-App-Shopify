import 'server-only'

/**
 * Purge les webhook_logs de plus de RETENTION_DAYS jours.
 *
 * webhook_logs stocke le payload JSON complet de chaque webhook → la table
 * grossit vite (c'était 83 MB / 3600 lignes avant la 1re purge). On la nettoie
 * périodiquement pour ne pas saturer le disque du VPS.
 *
 * Appelé depuis le cron run-automations (déjà chaque minute), mais throttlé en
 * mémoire pour ne s'exécuter qu'une fois par heure — inutile de purger 60×/h.
 */

const RETENTION_DAYS = 7
const THROTTLE_MS = 60 * 60 * 1000 // au plus une purge par heure

let lastRun = 0

export async function purgeWebhookLogs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: number
): Promise<{ purged: number; ran: boolean }> {
  if (now - lastRun < THROTTLE_MS) return { purged: 0, ran: false }
  lastRun = now

  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('webhook_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (error) {
    console.error('[maintenance] purge webhook_logs:', error.message)
    return { purged: 0, ran: true }
  }
  return { purged: count || 0, ran: true }
}
