import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Purge de rétention — RGPD art. 5.1.e (limitation de conservation).
 *
 * À ne pas confondre avec le droit à l'effacement (art. 17), couvert par les
 * webhooks `customers/redact` : ici on supprime AUTOMATIQUEMENT les données
 * devenues trop anciennes, sans que personne ne l'ait demandé.
 *
 * Ce qui est purgé :
 *   · messages     plus vieux que platform_settings.message_retention_days
 *   · webhook_logs plus vieux que platform_settings.log_retention_days
 *
 * Ce qui ne l'est JAMAIS :
 *   · les contacts (même sans message). Supprimer un contact opt-in casserait son
 *     consentement WhatsApp et le sortirait des automatisations : ce serait une
 *     régression fonctionnelle déguisée en conformité. On purge l'historique des
 *     échanges, pas la relation commerciale — le consentement, lui, s'efface sur
 *     demande (customers/redact) ou sur désabonnement.
 *
 * Sécurité : réservé au cron (Bearer CRON_SECRET), comme les autres jobs.
 */

export const maxDuration = 60

// Supprime par lots : une purge initiale peut porter sur des centaines de
// milliers de lignes, et un DELETE unique tiendrait un verrou trop longtemps.
const BATCH = 1000
const MAX_BATCHES = 50 // plafond par exécution ; le reste part au passage suivant.

type PurgeResult = { deleted: number; capped: boolean }

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Défini ici (et non au module) pour capturer `admin` : le type précis du client
  // Supabase ne survit pas à un passage en paramètre.
  const purgeOlderThan = async (
    table: 'messages' | 'webhook_logs',
    cutoffIso: string
  ): Promise<PurgeResult> => {
    let deleted = 0

    for (let i = 0; i < MAX_BATCHES; i++) {
      // On sélectionne les ids d'abord : `delete().lt(...).limit()` n'est pas
      // supporté par PostgREST, et un DELETE non borné verrouillerait la table.
      const { data: rows, error: selErr } = await admin
        .from(table)
        .select('id')
        .lt('created_at', cutoffIso)
        .limit(BATCH)
      if (selErr) throw new Error(`${table}: ${selErr.message}`)
      if (!rows?.length) return { deleted, capped: false }

      const ids = (rows as { id: string }[]).map((r) => r.id)
      const { error: delErr } = await admin.from(table).delete().in('id', ids)
      if (delErr) throw new Error(`${table}: ${delErr.message}`)

      deleted += ids.length
      // Lot incomplet = plus rien à purger.
      if (ids.length < BATCH) return { deleted, capped: false }
    }

    // Plafond atteint : il reste des lignes, le prochain passage les prendra.
    return { deleted, capped: true }
  }

  const { data: settings, error } = await admin
    .from('platform_settings')
    .select('message_retention_days, log_retention_days, retention_last_run_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messageDays = settings?.message_retention_days ?? 0
  const logDays = settings?.log_retention_days ?? 0

  const now = Date.now()

  // Verrou 24 h. Cette route est branchée sur l'ordonnanceur qui tourne CHAQUE
  // MINUTE : sans ce garde, on scannerait `messages` et `webhook_logs` — les deux
  // plus grosses tables — 1440 fois par jour pour n'effacer, au régime de croisière,
  // que quelques lignes. Une purge par jour suffit ; les 1439 autres appels
  // ressortent ici sans toucher à la base.
  const lastRun = settings?.retention_last_run_at
    ? new Date(settings.retention_last_run_at as string).getTime()
    : 0
  const sinceLastRun = now - lastRun
  if (sinceLastRun < 86_400_000) {
    return NextResponse.json({
      data: {
        skipped: 'déjà purgé il y a moins de 24 h',
        lastRunAt: settings?.retention_last_run_at ?? null,
        nextRunIn: `${Math.ceil((86_400_000 - sinceLastRun) / 3_600_000)} h`,
      },
    })
  }

  const cutoff = (days: number) => new Date(now - days * 86_400_000).toISOString()

  const report: Record<string, unknown> = { ranAt: new Date(now).toISOString() }

  try {
    // 0 / NULL = rétention illimitée : on ne purge pas. C'est le défaut, pour
    // qu'aucun déploiement ne se mette à effacer des données sans décision explicite.
    if (messageDays > 0) {
      const r = await purgeOlderThan('messages', cutoff(messageDays))
      report.messages = { retentionDays: messageDays, ...r }
    } else {
      report.messages = { skipped: 'rétention illimitée' }
    }

    if (logDays > 0) {
      const r = await purgeOlderThan('webhook_logs', cutoff(logDays))
      report.webhookLogs = { retentionDays: logDays, ...r }
    } else {
      report.webhookLogs = { skipped: 'rétention illimitée' }
    }
  } catch (e) {
    // Une purge qui échoue à mi-parcours a déjà supprimé des lots : on remonte
    // l'erreur avec ce qui a été fait, plutôt qu'un 500 muet. On NE marque PAS
    // le passage comme réussi : le prochain tick (dans 1 min) réessaiera, au lieu
    // d'attendre 24 h en laissant l'échec passer inaperçu.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Purge échouée', report },
      { status: 500 }
    )
  }

  // Réarme le verrou 24 h. Sans ce marquage, la purge repartirait à chaque minute.
  await admin
    .from('platform_settings')
    .update({ retention_last_run_at: new Date(now).toISOString() })
    .eq('id', 1)

  return NextResponse.json({ data: report })
}
