import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { evaluateConditions, nextAllowedSend } from '@/lib/automations/engine'
import { sendTemplateToContact } from '@/lib/automations/dispatch'
import { tierHeadroom } from '@/lib/whatsapp/sending-limits'

// Le cron peut envoyer des carrousels (download images Shopify + upload Meta) :
// on laisse jusqu'à 60 s pour éviter une coupure en plein lot.
export const maxDuration = 60

/**
 * Marge de palier d'envoi mise en cache le temps d'UN tick de cron (TTL court) :
 * on ne recompte pas les contacts uniques 24h à chaque job du même utilisateur.
 */
const tierCache = new Map<string, { exceeded: boolean; at: number }>()
const TIER_CACHE_MS = 30_000

/** Fallback si la config plateforme n'est pas lisible : variable d'env, puis 20h. */
const MARKETING_CAP_ENV_FALLBACK = (() => {
  const v = Number(process.env.MARKETING_CONTACT_CAP_HOURS)
  return Number.isFinite(v) && v >= 0 ? v : 20
})()

/**
 * Plafond de fréquence marketing par contact (anti-spam : au plus 1 message
 * marketing par contact dans cette fenêtre, en HEURES ; 0 = désactivé).
 *
 * Réglage ADMIN désormais : lu depuis platform_settings (modifiable dans /admin
 * sans redéploiement). C'est la WABA de Xeyo qui porte le risque qualité Meta,
 * donc c'est l'admin qui fixe ce plafond — pas chaque marchand.
 *
 * Mis en cache le temps d'un tick de cron (TTL court) pour ne pas requêter la
 * config à chaque job. Fallback env/défaut si la table est illisible (fail-safe).
 */
let marketingCapCache: { hours: number; at: number } | null = null
const MARKETING_CAP_CACHE_MS = 30_000
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function marketingContactCapHours(supabase: any): Promise<number> {
  if (marketingCapCache && Date.now() - marketingCapCache.at < MARKETING_CAP_CACHE_MS) {
    return marketingCapCache.hours
  }
  let hours = MARKETING_CAP_ENV_FALLBACK
  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('marketing_contact_cap_hours')
      .eq('id', 1)
      .maybeSingle()
    const v = data?.marketing_contact_cap_hours
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) hours = v
  } catch {
    // fail-safe : on garde le fallback env/défaut.
  }
  marketingCapCache = { hours, at: Date.now() }
  return hours
}
async function tierExceededFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, userId: string,
): Promise<boolean> {
  const hit = tierCache.get(userId)
  if (hit && Date.now() - hit.at < TIER_CACHE_MS) return hit.exceeded
  // Palier de la session connectée de l'utilisateur.
  const { data: sess } = await supabase
    .from('whatsapp_sessions')
    .select('messaging_limit_tier')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  const head = await tierHeadroom(supabase, userId, sess?.messaging_limit_tier ?? null)
  tierCache.set(userId, { exceeded: head.exceeded, at: Date.now() })
  return head.exceeded
}

/**
 * Cron — dépile la file automation_jobs.
 *
 * Pour chaque job dû (scheduled_at atteint, status pending) :
 *   1) charge l'automation (template, conditions, quiet hours)
 *   2) si quiet hours actives et on est dedans → repousse scheduled_at
 *   3) évalue les conditions métier (montant, 1re commande…)
 *   4) panier abandonné : skip si le contact a finalement commandé
 *   5) envoie le template, marque le job sent/skipped/failed
 *
 * À appeler périodiquement (ex: toutes les 5 min) avec Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getAdminSupabase()
  const now = new Date()

  // Déclencheurs temporels (pas de réponse / date / anniversaire) : on les
  // évalue ici pour n'avoir qu'UN SEUL schedule. Les jobs enfilés sont dus
  // immédiatement et traités dès ce tick (requête jobs ci-dessous).
  let temporalQueued = 0
  try {
    const { runTemporalTriggers } = await import('@/lib/automations/temporal')
    temporalQueued = (await runTemporalTriggers(supabase)).queued
  } catch (e) {
    console.error('[cron] temporal triggers:', e)
  }

  // Jobs dus. On monte la limite (500) et on traite par LOTS PARALLÈLES pour
  // absorber plus de volume par tick sans que le tick s'allonge linéairement.
  const { data: jobs } = await supabase
    .from('automation_jobs')
    .select('id, automation_id, contact_id, event_data, scheduled_at, current_node_id, created_at')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(500)

  // Jobs PARQUÉS sur un message à boutons dont le timeout (72 h) est dépassé :
  // le client n'a jamais cliqué → on les repasse en 'pending' pour que
  // processJob suive la branche timeout (si définie) ou clôture le funnel.
  // Jobs PARQUÉS arrivés à échéance de leur fenêtre de clic (30 j). La branche
  // « Par défaut » a DÉJÀ été exécutée à l'envoi (elle est la continuité normale),
  // donc ici on ne fait que CLÔTURER le parking — aucun message supplémentaire.
  const { data: expired } = await supabase
    .from('automation_jobs')
    .select('id')
    .eq('status', 'waiting')
    .lte('scheduled_at', now.toISOString())
    .limit(200)
  for (const w of (expired || []) as { id: string }[]) {
    await mark(supabase, w.id, 'sent', 'funnel : fenêtre de clic close')
  }

  const counts = { sent: 0, skipped: 0, failed: 0, deferred: 0 }
  const allJobs = jobs || []

  // Concurrence bornée : lots de 10 en parallèle. Chaque job est indépendant
  // (ligne distincte), donc parallélisable sans risque de course. La borne évite
  // d'ouvrir trop de connexions/appels WhatsApp simultanés.
  const BATCH = 10
  for (let i = 0; i < allJobs.length; i += BATCH) {
    const slice = allJobs.slice(i, i + BATCH)
    const outcomes = await Promise.all(slice.map((job) => processJob(supabase, job, now)))
    for (const o of outcomes) counts[o]++
  }

  // Draine aussi la file des réponses IA enfilées en pic (backpressure). On
  // mutualise ce schedule d'une minute plutôt que d'ajouter une tâche cron dédiée.
  let aiJobs = { processed: 0, sent: 0, failed: 0 }
  try {
    const { drainAiJobs } = await import('@/app/api/cron/run-ai-jobs/route')
    aiJobs = await drainAiJobs(supabase)
  } catch (e) {
    console.error('[cron] drain ai_jobs:', e)
  }

  // Maintenance : purge des vieux webhook_logs (throttlé à 1×/h en interne) pour
  // éviter que la table gonfle (payloads JSON complets → grossit vite).
  try {
    const { purgeWebhookLogs } = await import('@/lib/maintenance/purge-webhook-logs')
    await purgeWebhookLogs(supabase, now.getTime())
  } catch (e) {
    console.error('[cron] purge webhook_logs:', e)
  }

  // Filet de sécurité qualité WhatsApp : relit la santé de tous les numéros
  // chez Meta (throttlé 1×/6h) pour les marchands sans webhooks abonnés.
  try {
    const { sweepWhatsappHealth } = await import('@/lib/whatsapp/health-sweep')
    await sweepWhatsappHealth(supabase, now.getTime())
  } catch (e) {
    console.error('[cron] whatsapp health sweep:', e)
  }

  return NextResponse.json({ ok: true, processed: allJobs.length, ...counts, temporalQueued, aiJobs })
}

type JobRow = {
  id: string; automation_id: string; contact_id: string | null
  event_data: unknown; scheduled_at: string; current_node_id: string | null; created_at: string | null
}
type Outcome = 'sent' | 'skipped' | 'failed' | 'deferred'

/**
 * Traite UN job d'automation et renvoie son issue. Extrait de la boucle pour
 * pouvoir traiter les jobs en parallèle par lots. Ne throw pas (les erreurs sont
 * remontées en 'failed' via mark).
 */
async function processJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  job: JobRow,
  now: Date
): Promise<Outcome> {
  const { data: auto } = await supabase
    .from('automations')
    .select('id, user_id, template_id, conditions, quiet_start, quiet_end, timezone, trigger_event, is_active, builder_mode, graph, kind')
    .eq('id', job.automation_id)
    .maybeSingle()

  if (!auto || !auto.is_active) {
    await mark(supabase, job.id, 'skipped', 'automation inactive/supprimée')
    return 'skipped'
  }

  // Quiet hours : repousser si on est dans la fenêtre interdite
  const allowed = nextAllowedSend(now, auto.quiet_start, auto.quiet_end, auto.timezone || 'Europe/Paris')
  if (allowed.getTime() > now.getTime()) {
    await supabase.from('automation_jobs').update({ scheduled_at: allowed.toISOString() }).eq('id', job.id)
    return 'deferred'
  }

  const eventData = (job.event_data || {}) as {
    variables?: Record<string, string>; total?: number | null; isFirstOrder?: boolean | null
    productTitles?: string[]; collections?: string[]; country?: string; language?: string
    cartToken?: string | null; cartCreatedAt?: string | null
  }
  if (!job.contact_id) { await mark(supabase, job.id, 'skipped', 'pas de contact'); return 'skipped' }

  // PANIER ABANDONNÉ : ne jamais relancer un panier qui a abouti.
  //
  // Premier rempart (le vrai) : le webhook `orders/*` annule les jobs du panier
  // via son `checkout_token` dès qu'une commande arrive — sans dépendre de
  // l'ordre d'arrivée des webhooks. Ce test-ci est le SECOND filet, pour les cas
  // où la commande n'expose pas de checkout_token (commande manuelle, POS…).
  //
  // ⚠️ La comparaison portait avant sur `job.created_at`, ce qui laissait passer
  // les commandes payées AVANT la création du job — or Shopify émet
  // `checkouts/create` et `orders/create` quasi simultanément, donc ce cas est
  // fréquent, pas exotique. On compare désormais à la date du PANIER : toute
  // commande postérieure au panier le rend caduc, quel que soit l'ordre.
  if (auto.trigger_event === 'checkout_abandoned') {
    const { data: c } = await supabase
      .from('contacts')
      .select('last_order_at')
      .eq('id', job.contact_id)
      .maybeSingle()
    // Date du panier : celle de l'événement, pas celle du job.
    const cartAt = eventData.cartCreatedAt || job.created_at
    const ordered = c?.last_order_at && cartAt && new Date(c.last_order_at) >= new Date(cartAt)
    if (ordered) { await mark(supabase, job.id, 'skipped', 'commande finalisée entre-temps'); return 'skipped' }
  }

  // ---- Mode BUILDER (graphe de nœuds) ----
  if (auto.builder_mode && auto.graph) {
    const { stepWorkflow } = await import('@/lib/automations/graph-engine')
    // Condition « Étape/Tag » (has_stage) : elle a besoin des étapes ACTUELLES
    // du contact. On ne charge la conversation_lifecycle_stages QUE si le graphe
    // porte au moins une condition has_stage (sinon coût inutile à chaque job).
    let stageIds: string[] | undefined
    const usesStageCondition = Array.isArray(auto.graph.nodes)
      && auto.graph.nodes.some((n: { type?: string; rule?: { field?: string } }) =>
        n.type === 'condition' && n.rule?.field === 'has_stage')
    if (usesStageCondition && job.contact_id) {
      // Étapes portées par la (les) conversation(s) de ce contact. On agrège au
      // niveau contact : le tag vit sur la conversation, mais la condition
      // raisonne « ce contact a-t-il tel tag ? ».
      const { data: convs } = await supabase
        .from('conversations').select('id').eq('contact_id', job.contact_id)
      const convIds = (convs || []).map((c: { id: string }) => c.id)
      if (convIds.length > 0) {
        const { data: cls } = await supabase
          .from('conversation_lifecycle_stages')
          .select('stage_id')
          .in('conversation_id', convIds)
        stageIds = [...new Set<string>((cls || []).map((r: { stage_id: string }) => r.stage_id))]
      } else {
        stageIds = []
      }
    }
    const ctx = {
      contactId: job.contact_id,
      total: eventData.total ?? undefined,
      isFirstOrder: eventData.isFirstOrder ?? undefined,
      productTitles: eventData.productTitles,
      collections: eventData.collections,
      country: eventData.country,
      language: eventData.language,
      stageIds,
      variables: eventData.variables || {},
    }
    // current_node_id null = on vient de finir un delay sur ce nœud → on le saute.
    const step = stepWorkflow(auto.graph, ctx, job.current_node_id || null, !!job.current_node_id)

    if (step.kind === 'done') { await mark(supabase, job.id, 'sent', 'workflow terminé'); return 'sent' }
    if (step.kind === 'wait') {
      const when = new Date(now.getTime() + step.minutes * 60_000).toISOString()
      await supabase.from('automation_jobs').update({ current_node_id: step.nextNodeId, scheduled_at: when }).eq('id', job.id)
      return 'deferred'
    }

    // GARDE-FOU PALIER : si l'utilisateur a déjà atteint son plafond de contacts
    // uniques sur 24h (palier Meta), on DIFFÈRE l'envoi plutôt que de le tenter
    // (dépasser dégrade la qualité → réduit le palier). Report +60 min : la
    // fenêtre glissante libèrera de la place. best-effort, jamais bloquant.
    if (await tierExceededFor(supabase, auto.user_id)) {
      await deferJob(supabase, job.id, now, 60)
      return 'deferred'
    }

    // FRÉQUENCE PAR CONTACT (marketing uniquement) : ne pas sur-solliciter le
    // même contact avec plusieurs messages MARKETING dans la même journée
    // (blocages/signalements → chute de qualité). Le transactionnel (SAV,
    // statuts de commande) n'est PAS concerné : il doit toujours partir.
    if (auto.kind === 'marketing') {
      const capHours = await marketingContactCapHours(supabase)
      const { contactMessagedWithin } = await import('@/lib/whatsapp/sending-limits')
      if (await contactMessagedWithin(supabase, auto.user_id, job.contact_id, capHours)) {
        await mark(supabase, job.id, 'skipped', 'fréquence marketing : contact déjà sollicité aujourd’hui')
        return 'skipped'
      }
    }

    // send OU send_wait_click : dans les deux cas on envoie le message.
    // Les valeurs saisies par le marchand sur le NŒUD (code promo…) priment sur
    // le contexte du déclencheur : elles n'existent nulle part ailleurs. Sans
    // elles, le client recevait « utilisez le code — » (le fallback).
    const r = await sendTemplateToContact({
      templateId: step.templateId, contactId: job.contact_id,
      variables: { ...(eventData.variables || {}), ...(step.vars || {}) },
      automationId: auto.id,
    })
    if (!r.ok) {
      const d = deferReason(r.error)
      if (d) { await deferJob(supabase, job.id, now, d); return 'deferred' }
      await mark(supabase, job.id, 'failed', r.error || 'échec'); return 'failed'
    }
    // Engagement : on enregistre CHAQUE envoi (entonnoir + A/B). Pour un message
    // à boutons on garde le node id de l'action (pour tracer la branche cliquée).
    await recordEngagement(supabase, auto.user_id, auto.id,
      step.abTest ? step.abTest.nodeId : (step.kind === 'send_wait_click' ? step.nodeId : '_send'), job.contact_id,
      step.abTest ? step.abTest.variant : '_')

    if (step.kind === 'send_wait_click') {
      // MESSAGE À BOUTONS. La branche « Par défaut » (edge button:__timeout__) est
      // la CONTINUITÉ NORMALE du parcours : elle part IMMÉDIATEMENT (ex. envoyer
      // le message suivant / carrousel), sans attendre de clic. En parallèle, on
      // PARQUE le job pour que les boutons (Oui/Non…) restent cliquables et
      // déclenchent leurs branches via le webhook (resumeFromButton).
      const { timeoutTarget } = await import('@/lib/automations/graph-engine')
      const defaultNext = timeoutTarget(auto.graph, step.nodeId)
      if (defaultNext) {
        // Nouveau job pour exécuter la suite par défaut tout de suite.
        // user_id est NOT NULL sur automation_jobs → l'omettre faisait échouer
        // l'insert en silence (la branche par défaut ne partait jamais).
        const { error: defErr } = await supabase.from('automation_jobs').insert({
          automation_id: auto.id, user_id: auto.user_id, contact_id: job.contact_id, current_node_id: defaultNext,
          status: 'pending', scheduled_at: now.toISOString(),
          event_data: { variables: eventData.variables || {} },
          dedup_key: `default:${job.id}`,
        })
        if (defErr) console.error('[cron] insert job branche par défaut échoué:', defErr.message)
      }
      // Le job d'origine reste PARQUÉ pour capter les clics de boutons. Fenêtre
      // longue (30 j) : au-delà, la purge le clôturera (les boutons WhatsApp ne
      // fonctionnent plus après 24 h de toute façon, mais on garde de la marge).
      const parkUntil = new Date(now.getTime() + 30 * 24 * 3600_000).toISOString()
      // Marque la branche par défaut comme déjà suivie (dédup côté clics).
      const ed0 = (eventData || {}) as { variables?: Record<string, string> }
      await supabase.from('automation_jobs').update({
        status: 'waiting', current_node_id: step.nodeId, scheduled_at: parkUntil,
        event_data: { ...eventData, variables: ed0.variables || {}, clicked_branches: ['__default__'] },
      }).eq('id', job.id)
      return 'deferred'
    }

    // send simple : continuer au prochain tick, ou clore.
    if (step.nextNodeId) {
      await supabase.from('automation_jobs').update({ current_node_id: step.nextNodeId, scheduled_at: now.toISOString() }).eq('id', job.id)
    } else {
      await mark(supabase, job.id, 'sent', null)
    }
    return 'sent'
  }

  // ---- Mode LINÉAIRE (rétrocompat) ----
  if (!auto.template_id) { await mark(supabase, job.id, 'skipped', 'pas de modèle'); return 'skipped' }
  const reason = evaluateConditions(auto.conditions || {}, { total: eventData.total, isFirstOrder: eventData.isFirstOrder })
  if (reason) { await mark(supabase, job.id, 'skipped', reason); return 'skipped' }

  const r = await sendTemplateToContact({
    templateId: auto.template_id,
    contactId: job.contact_id,
    variables: eventData.variables || {},
    automationId: auto.id,
  })
  if (r.ok) {
    await recordEngagement(supabase, auto.user_id, auto.id, '_send', job.contact_id, '_')
    await mark(supabase, job.id, 'sent', null); return 'sent'
  }
  const d = deferReason(r.error)
  if (d) { await deferJob(supabase, job.id, now, d); return 'deferred' }
  await mark(supabase, job.id, 'failed', r.error || 'échec')
  return 'failed'
}

/**
 * Enregistre un envoi initié pour l'entonnoir + les stats A/B.
 * Une ligne par (automation, node, contact) — idempotent. Les colonnes
 * opened/responded/ordered sont ensuite remplies par les webhooks.
 */
async function recordEngagement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  automationId: string,
  nodeId: string,
  contactId: string,
  variant: string
) {
  await supabase.from('ab_test_assignments').upsert({
    user_id: userId ?? null,
    automation_id: automationId,
    node_id: nodeId,
    contact_id: contactId,
    variant_key: variant,
  }, { onConflict: 'automation_id,node_id,contact_id', ignoreDuplicates: true })
}

/**
 * Certaines "erreurs" ne sont PAS des échecs : l'envoi doit être RÉESSAYÉ plus
 * tard (jamais perdu). Renvoie le délai de report en minutes, ou null si c'est
 * un vrai échec.
 *   - rate_limited    : palier Meta 24h atteint → +60 min (fenêtre glissante)
 *   - marketing_paused: numéro classé ROUGE → +180 min (attendre le retour vert)
 */
function deferReason(error: string | undefined): number | null {
  if (error === 'rate_limited') return 60
  if (error === 'marketing_paused') return 180
  return null
}

async function deferJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  now: Date,
  minutes: number
) {
  const when = new Date(now.getTime() + minutes * 60_000).toISOString()
  // On garde status 'pending' → le job sera re-tenté ; on ne le marque JAMAIS
  // 'failed' (l'envoi n'est pas perdu, juste étalé).
  await supabase.from('automation_jobs').update({ scheduled_at: when, result: `report: ${minutes}min` }).eq('id', id)
}

async function mark(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  status: 'sent' | 'skipped' | 'failed',
  result: string | null
) {
  await supabase.from('automation_jobs')
    .update({ status, result, processed_at: new Date().toISOString() })
    .eq('id', id)
}
