import 'server-only'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

/**
 * Journal d'audit des accès aux données personnelles (RGPD art. 30 & 32).
 *
 * Répond à la question qui compte après un incident : « qui a accédé à quelles
 * données, et quand ? ». Déclaré à Shopify (Protected Customer Data).
 *
 * ⚠️ Ne pas confondre avec `webhook_logs`, qui trace les payloads entrants.
 *
 * CE QU'ON JOURNALISE — les accès à volume ou à risque :
 *   · export       : le marchand extrait ses contacts (CSV, API)
 *   · bulk_read    : lecture en masse (listing de contacts)
 *   · erasure      : effacement RGPD (customers/redact, purge)
 *   · admin_access : un admin Xeyo touche aux données d'un marchand ← le plus sensible
 *
 * CE QU'ON NE JOURNALISE PAS : l'ouverture d'une conversation par son
 * propriétaire légitime. Tracer chaque affichage produirait des millions de
 * lignes sans valeur d'audit et ferait de cette table un goulot d'étranglement.
 */

export type AuditAction = 'export' | 'bulk_read' | 'erasure' | 'admin_access'
export type AuditRole = 'user' | 'admin' | 'system'

export type AuditEntry = {
  action: AuditAction
  /** Table ou domaine touché : 'contacts', 'conversations', 'messages'… */
  resource: string
  /** Nombre de personnes concernées — le chiffre clé en cas d'incident. */
  recordCount?: number
  actorId?: string | null
  actorEmail?: string | null
  actorRole?: AuditRole
  /** Compte marchand dont les données sont touchées. */
  targetUserId?: string | null
  /**
   * Contexte (filtres, shop_domain, motif…).
   * ⚠️ JAMAIS de donnée personnelle ici : ce journal survit aux données qu'il
   * décrit (il n'est pas soumis à la purge de rétention).
   */
  metadata?: Record<string, unknown>
  req?: NextRequest
}

/**
 * Écrit une entrée d'audit. **Ne lève jamais** : un journal défaillant ne doit
 * pas faire échouer l'action métier qu'il observe (un export qui plante parce que
 * l'audit est cassé serait pire que pas d'audit). L'échec est signalé en console.
 *
 * Volontairement non-awaité par les appelants : on n'ajoute pas de latence à une
 * requête utilisateur pour écrire une ligne de log.
 */
export async function logDataAccess(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Derrière un reverse proxy, l'IP réelle est dans x-forwarded-for (1re valeur).
    const ip =
      entry.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      entry.req?.headers.get('x-real-ip') ||
      null

    await admin.from('data_access_log').insert({
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      actor_role: entry.actorRole ?? 'user',
      action: entry.action,
      resource: entry.resource,
      record_count: entry.recordCount ?? null,
      target_user_id: entry.targetUserId ?? entry.actorId ?? null,
      metadata: entry.metadata ?? null,
      ip,
    })
  } catch (e) {
    console.error('[audit] écriture du journal échouée:', e)
  }
}
