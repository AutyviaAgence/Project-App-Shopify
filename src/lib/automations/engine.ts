import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import type { Automation, AutomationConditions, EventContext, TriggerEvent } from './types'
import { isRepeatableTrigger, defaultRecurrenceFor } from './types'
import type { TriggerRecurrence } from './graph-types'

/**
 * Traduit la récurrence choisie en SUFFIXE de clé de déduplication.
 *
 * C'est le seul endroit qui décide « ce contact peut-il redéclencher ? ». Le
 * verrou est l'unicité (automation_id, dedup_key) EN BASE : un job en double est
 * refusé par Postgres, pas par un compteur applicatif qu'une course pourrait
 * contourner (deux webhooks simultanés lisent le même compteur et passent tous
 * les deux).
 *
 * - once      : suffixe constant → une seule fois par contact, définitivement.
 * - per_event : suffixe = l'occurrence (wamid, silence courant, token de panier)
 *               → une fois par occurrence réelle.
 * - daily     : suffixe = le jour → au plus une par jour.
 *
 * `eventAnchor` doit identifier l'occurrence ; s'il est instable (un id réémis à
 * chaque webhook), `per_event` devient une boucle — c'est exactement ce qui est
 * arrivé sur message_read (wamid neuf à chaque lecture) et checkouts/create.
 */
export function dedupSuffix(recurrence: TriggerRecurrence | undefined, eventAnchor: string): string {
  switch (recurrence) {
    case 'per_event': return eventAnchor
    case 'daily': return new Date().toISOString().slice(0, 10)
    case 'once':
    default: return 'once' // défaut SÛR : aucune boucle sans choix explicite
  }
}

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Enfile les jobs d'automatisation pour un événement Shopify.
 * Appelé depuis les webhooks. Pour chaque automation active correspondant à
 * l'événement et à l'utilisateur, crée un automation_job programmé à
 * (now + delay_minutes). L'idempotence évite les doublons (dedup_key).
 */
export async function enqueueAutomations(params: {
  userId: string
  event: TriggerEvent
  ctx: EventContext
}): Promise<{ queued: number }> {
  const supabase = admin()

  const { data: automationsRaw } = await supabase
    .from('automations')
    .select('id, delay_minutes, builder_mode, trigger_button_text, graph')
    .eq('user_id', params.userId)
    .eq('trigger_event', params.event)
    .eq('is_active', true)

  let automations = automationsRaw
  // button_clicked : ne garder que les automations dont le libellé de bouton
  // correspond (comparaison insensible casse/espaces). trigger_button_text NULL
  // = "n'importe quel bouton".
  if (params.event === 'button_clicked') {
    const norm = (s?: string | null) => (s || '').trim().toLowerCase()
    const clicked = norm(params.ctx.buttonTitle)
    automations = (automationsRaw || []).filter(
      (a) => !a.trigger_button_text || norm(a.trigger_button_text) === clicked
    )
  }

  if (!automations || automations.length === 0) return { queued: 0 }

  const now = Date.now()
  let queued = 0
  for (const a of automations) {
    // Builder : le graphe gère ses propres délais → on démarre immédiatement.
    const scheduledAt = a.builder_mode
      ? new Date(now).toISOString()
      : new Date(now + (a.delay_minutes || 0) * 60_000).toISOString()

    // ── Récurrence : combien de fois CE contact peut redéclencher ──────────
    //
    // ⚠️ UNIQUEMENT pour les triggers RÉPÉTABLES (message_read, opt-in, clic,
    // panier…). Surtout pas pour une commande : `order_paid` est déjà borné par
    // l'id de la commande, et lui appliquer le défaut 'once' priverait un client
    // fidèle de toute confirmation dès sa DEUXIÈME commande. La borne d'un
    // événement ponctuel, c'est l'événement lui-même.
    //
    // La clé est calculée PAR automatisation : deux automatisations sur le même
    // événement peuvent avoir des réglages différents, et l'unicité en base porte
    // sur (automation_id, dedup_key) — chacune a donc sa propre borne.
    //
    // Le défaut ('once') est volontairement le plus strict : un trigger qui
    // s'auto-nourrit — on envoie, le client lit, ce qui redéclenche — boucle à
    // l'infini sinon. C'est arrivé en production sur message_read.
    let dedupKey: string | null = params.ctx.dedupKey ? `${params.event}:${params.ctx.dedupKey}` : null

    if (isRepeatableTrigger(params.event) && params.ctx.contactId) {
      const trigNode = (a.graph?.nodes || []).find(
        (n: { type?: string }) => n.type === 'trigger'
      ) as { recurrence?: TriggerRecurrence } | undefined

      // Le défaut dépend du déclencheur : 'once' partout (sûr), sauf panier
      // abandonné où il vaut 'per_event' — sinon on ne relancerait qu'un seul
      // panier par client dans sa vie. Cf. defaultRecurrenceFor.
      const recurrence = trigNode?.recurrence ?? defaultRecurrenceFor(params.event)

      // L'ancre identifie l'occurrence pour 'per_event'. Sans clé fournie par
      // l'appelant, le contact fait l'affaire — 'per_event' se comporte alors
      // comme 'once', ce qui est le repli sûr.
      const anchor = params.ctx.dedupKey || `contact:${params.ctx.contactId}`
      dedupKey = `${params.event}:${params.ctx.contactId}:${dedupSuffix(recurrence, anchor)}`
    }

    const { error } = await supabase.from('automation_jobs').insert({
      automation_id: a.id,
      user_id: params.userId,
      contact_id: params.ctx.contactId,
      event_data: {
        variables: params.ctx.variables,
        total: params.ctx.total ?? null,
        isFirstOrder: params.ctx.isFirstOrder ?? null,
        productTitles: params.ctx.productTitles ?? null,
        collections: params.ctx.collections ?? null,
        country: params.ctx.country ?? null,
        language: params.ctx.language ?? null,
        // Panier abandonné : servent au cron à revérifier, avant d'envoyer, que
        // ce panier n'a pas été payé entre-temps.
        cartToken: params.ctx.cartToken ?? null,
        cartCreatedAt: params.ctx.cartCreatedAt ?? null,
      },
      scheduled_at: scheduledAt,
      status: 'pending',
      current_node_id: null,
      dedup_key: dedupKey,
    })
    // 23505 = doublon dedup (déjà enfilé) → on ignore silencieusement
    if (!error) queued++
    else if (error.code !== '23505') console.error('[automations] enqueue error:', error.message)
  }
  return { queued }
}

/**
 * Évalue les conditions métier d'une automation contre les données d'événement.
 * Retourne null si OK, sinon une raison de skip.
 */
export function evaluateConditions(
  conditions: AutomationConditions,
  data: { total?: number | null; isFirstOrder?: boolean | null }
): string | null {
  if (conditions.min_total != null && (data.total == null || data.total < conditions.min_total)) {
    return `montant < ${conditions.min_total}`
  }
  if (conditions.max_total != null && (data.total != null && data.total > conditions.max_total)) {
    return `montant > ${conditions.max_total}`
  }
  if (conditions.first_order_only && data.isFirstOrder === false) {
    return 'pas la première commande'
  }
  return null
}

/**
 * Vérifie la fenêtre horaire "quiet hours". Retourne la prochaine date d'envoi
 * autorisée (ou la date actuelle si on est hors quiet hours).
 *
 * quiet_start/quiet_end en heures locales (timezone). Ex: 21→8 = ne pas envoyer
 * entre 21h et 8h → repousser à 8h.
 */
export function nextAllowedSend(
  now: Date,
  quietStart: number | null,
  quietEnd: number | null,
  timezone: string
): Date {
  if (quietStart == null || quietEnd == null) return now

  // Heure locale courante dans la timezone de l'automation.
  const localHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(now)
  )

  const inQuiet = quietStart < quietEnd
    ? (localHour >= quietStart && localHour < quietEnd)        // ex: 0→8
    : (localHour >= quietStart || localHour < quietEnd)        // ex: 21→8 (traverse minuit)

  if (!inQuiet) return now

  // Repousser à quiet_end (prochaine occurrence). On calcule le nombre d'heures
  // à attendre jusqu'à quiet_end.
  let hoursToWait = (quietEnd - localHour + 24) % 24
  if (hoursToWait === 0) hoursToWait = 24
  return new Date(now.getTime() + hoursToWait * 60 * 60 * 1000)
}

export type { Automation }

/** Libellés QUICK_REPLY d'un jeu de boutons (dans l'ordre). */
function quickReplyLabels(buttons: unknown): string[] {
  if (!Array.isArray(buttons)) return []
  return buttons
    .filter((b): b is { type: string; text: string } =>
      !!b && typeof b === 'object' && (b as { type?: string }).type === 'QUICK_REPLY')
    .map((b) => b.text)
}

/**
 * Charge les libellés de boutons quick-reply de TOUTES les langues du template
 * porté par le nœud action `nodeId`, LANGUE SOURCE EN PREMIER. Sert à résoudre
 * un clic reçu dans une langue traduite vers le libellé source de la branche.
 * Retourne `[]` si le nœud n'a pas de template ou pas de boutons.
 */
async function loadNodeButtonVariants(
  supabase: ReturnType<typeof admin>,
  graph: { nodes?: { id: string; type: string; templateId?: string | null }[] },
  nodeId: string,
): Promise<string[][]> {
  const node = (graph.nodes || []).find((n) => n.id === nodeId)
  if (!node || node.type !== 'action' || !node.templateId) return []
  // Template du nœud → son groupe (même `name`), avec la langue source.
  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('name, user_id, language, source_language, buttons')
    .eq('id', node.templateId)
    .maybeSingle()
  if (!tpl?.name) return []
  const { data: variants } = await supabase
    .from('whatsapp_templates')
    .select('language, source_language, buttons')
    .eq('user_id', tpl.user_id)
    .eq('name', tpl.name)
  const rows = (variants && variants.length > 0 ? variants : [tpl]) as {
    language: string; source_language?: string | null; buttons: unknown
  }[]
  // La langue SOURCE (celle où les branches ont été saisies) doit venir en 1re
  // position : c'est l'ordre de référence pour mapper les index de boutons.
  // `source_language` est renseigné sur chaque variante et pointe la langue
  // d'origine ; à défaut, on prend la langue du template du nœud.
  const sourceLang = tpl.source_language || tpl.language
  const isSource = (r: { language: string }) => r.language === sourceLang
  rows.sort((a, b) => (isSource(b) ? 1 : 0) - (isSource(a) ? 1 : 0))
  return rows.map((r) => quickReplyLabels(r.buttons)).filter((arr) => arr.length > 0)
}

/**
 * FUNNEL À BOUTONS : un contact vient de cliquer un bouton. Si un job de
 * campagne est PARQUÉ (status='waiting') sur un message à boutons pour ce
 * contact, on le REPREND sur la branche correspondant au libellé cliqué :
 * on résout le node cible (resumeFromButton), on repasse le job en 'pending'
 * pointé dessus, le cron enchaîne au prochain tick.
 *
 * Sans job parqué ou sans branche correspondante : no-op (le clic peut encore
 * démarrer une automation button_clicked indépendante, gérée à côté).
 */
export async function resumeParkedFunnel(contactId: string, clickedText: string): Promise<boolean> {
  if (!contactId) return false
  const supabase = admin()

  // Job parqué le plus récent pour ce contact (un contact ne devrait en avoir
  // qu'un à la fois sur un funnel, mais on prend le dernier par sécurité).
  const { data: jobs } = await supabase
    .from('automation_jobs')
    .select('id, automation_id, user_id, contact_id, current_node_id, event_data')
    .eq('contact_id', contactId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(5)
  if (!jobs || jobs.length === 0) return false

  const { resumeFromButton } = await import('./graph-engine')
  const { findNode } = await import('./graph-types')

  type ParkedJob = { id: string; automation_id: string; user_id: string; contact_id: string | null; current_node_id: string | null; event_data: Record<string, unknown> | null }
  for (const job of jobs as ParkedJob[]) {
    if (!job.current_node_id) continue
    const { data: auto } = await supabase
      .from('automations').select('graph, is_active').eq('id', job.automation_id).maybeSingle()
    if (!auto?.is_active || !auto.graph) continue

    // Boutons multilingues : le contact a pu recevoir une variante TRADUITE, donc
    // le libellé cliqué (« Yes ») ne matche pas la branche source (« Oui »). On
    // charge les libellés quick-reply de TOUTES les langues du template de ce
    // nœud (langue source en 1re) pour ramener le clic au libellé source.
    const variantButtons = await loadNodeButtonVariants(supabase, auto.graph, job.current_node_id)

    const next = resumeFromButton(auto.graph, job.current_node_id, clickedText, variantButtons)
    if (!next) continue // ce funnel n'a pas de branche pour ce bouton → on tente le suivant

    // Libellé SOURCE (résolu depuis la langue traduite) pour tracer/dédupliquer.
    const { resolveClickedToSourceLabel } = await import('./graph-engine')
    const sourceLabel = (variantButtons.length > 0
      ? resolveClickedToSourceLabel(clickedText, variantButtons)
      : null) || clickedText

    // MODE MULTI-ROUTE : si le message autorise plusieurs réponses, le contact
    // peut cliquer plusieurs boutons et recevoir chaque branche. Chaque bouton
    // ne se déclenche qu'UNE fois (dédup via la liste des boutons déjà cliqués,
    // stockée sur le job parqué). Le job parqué RESTE en waiting pour accepter
    // d'autres boutons ; on crée un NOUVEAU job pour exécuter la branche.
    // allowMultiple : défaut TRUE si NON défini (cohérent avec l'UI, timeline.tsx
    // affiche le toggle activé quand allowMultiple !== false). Le moteur exigeait
    // `=== true`, donc un nœud à `undefined` était traité comme mono-route alors
    // que l'UI le montrait activé → les autres branches ne s'activaient jamais.
    const actionNode = findNode(auto.graph, job.current_node_id)
    const allowMultiple = actionNode?.type === 'action' && actionNode.allowMultiple !== false

    // Trace stats (best-effort, résilient si colonne absente).
    const trace = { responded: true, responded_at: new Date().toISOString() }
    const { error: tErr } = await supabase.from('ab_test_assignments')
      .update({ ...trace, clicked_branch: `button:${sourceLabel}` })
      .eq('automation_id', job.automation_id).eq('node_id', job.current_node_id).eq('contact_id', contactId)
    if (tErr && (tErr.code === '42703' || /clicked_branch/.test(tErr.message || ''))) {
      await supabase.from('ab_test_assignments').update(trace)
        .eq('automation_id', job.automation_id).eq('node_id', job.current_node_id).eq('contact_id', contactId)
    }

    if (allowMultiple) {
      // Dédup : ce bouton a-t-il déjà été cliqué sur ce funnel ?
      const ed = (job.event_data || {}) as { clicked_branches?: string[]; variables?: Record<string, string> }
      const clicked = Array.isArray(ed.clicked_branches) ? ed.clicked_branches : []
      const norm = sourceLabel.trim().toLowerCase()
      if (clicked.includes(norm)) return true // déjà suivi → on ignore (pas de doublon)
      // Nouveau job pour exécuter la branche, sans toucher au job parqué.
      // user_id est NOT NULL → l'omettre faisait échouer l'insert en silence
      // (la branche du bouton cliqué ne s'exécutait jamais).
      const { error: brErr } = await supabase.from('automation_jobs').insert({
        automation_id: job.automation_id,
        user_id: job.user_id,
        contact_id: job.contact_id,
        current_node_id: next,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        event_data: { variables: ed.variables || {} },
        dedup_key: `branch:${job.id}:${norm}`,
      })
      if (brErr) console.error('[funnel] insert job branche cliquée échoué:', brErr.message)
      // Mémorise le bouton cliqué sur le job PARQUÉ (qui reste waiting).
      await supabase.from('automation_jobs')
        .update({ event_data: { ...ed, clicked_branches: [...clicked, norm] } })
        .eq('id', job.id)
      return true
    }

    // MODE UNE SEULE ROUTE (défaut historique) : le 1er clic ferme le funnel.
    // On réveille le job parqué sur la branche ; les clics suivants ne trouvent
    // plus de job waiting → ignorés.
    await supabase.from('automation_jobs').update({
      status: 'pending', current_node_id: next, scheduled_at: new Date().toISOString(),
    }).eq('id', job.id)
    return true
  }
  return false
}
