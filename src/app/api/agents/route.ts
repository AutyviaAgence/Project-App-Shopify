import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPlanQuota } from '@/lib/plan-quota'
import { OPT_OUT_PROMPT, HANDOFF_PROMPT } from '@/lib/agents/opt-out-prompt'

const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o']

// ─── Apparence par défaut : mascotte + couleur ALÉATOIRES ────────────────────
// Sans ça, tout nouvel agent retombait sur le fallback (pose-1 + violet) et tous
// les agents se ressemblaient. On tire au sort à la création pour que chacun ait
// d'emblée sa propre identité visuelle (le marchand peut la changer ensuite).
//
// ⚠️ Doit rester aligné sur MASCOTS / MASCOT_BGS de la page agents
// (src/app/(dashboard)/agents/page.tsx) : une clé inconnue retomberait sur le
// fallback côté UI.
const MASCOT_KEYS = [
  'pose-1', 'pose-2', 'pose-5', 'pose-6', 'pose-7',
  'pose-8', 'pose-10', 'pose-17', 'pose-19', 'pose-21', 'selfie',
]
const MASCOT_BG_KEYS = ['green', 'blue', 'violet', 'coral', 'amber', 'sky']
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** GET /api/agents — Lister les agents IA de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: allAgents, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const agents = allAgents || []
  const agentIds = agents.map(a => a.id)

  // Récupérer les stats de booking (propositions et clics) pour chaque agent
  const bookingStatsMap: Record<string, {
    total_proposals: number
    total_clicks: number
    unique_contacts: number
    conversion_rate: number
  }> = {}

  if (agentIds.length > 0) {
    // Récupérer les propositions et clics en parallèle
    const [
      { data: bookingProposals },
      { data: bookingClicks },
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('booking_proposals')
        .select('agent_id, clicked')
        .in('agent_id', agentIds) as Promise<{ data: { agent_id: string; clicked: boolean }[] | null }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('booking_link_clicks')
        .select('agent_id, contact_id')
        .in('agent_id', agentIds) as Promise<{ data: { agent_id: string; contact_id: string | null }[] | null }>,
    ])

    // Compter les propositions par agent
    if (bookingProposals) {
      for (const proposal of bookingProposals) {
        if (!bookingStatsMap[proposal.agent_id]) {
          bookingStatsMap[proposal.agent_id] = {
            total_proposals: 0,
            total_clicks: 0,
            unique_contacts: 0,
            conversion_rate: 0,
          }
        }
        bookingStatsMap[proposal.agent_id].total_proposals++
      }
    }

    // Compter les clics et contacts uniques par agent
    if (bookingClicks) {
      const contactsByAgent: Record<string, Set<string>> = {}
      for (const click of bookingClicks) {
        if (!bookingStatsMap[click.agent_id]) {
          bookingStatsMap[click.agent_id] = {
            total_proposals: 0,
            total_clicks: 0,
            unique_contacts: 0,
            conversion_rate: 0,
          }
        }
        bookingStatsMap[click.agent_id].total_clicks++

        if (click.contact_id) {
          if (!contactsByAgent[click.agent_id]) {
            contactsByAgent[click.agent_id] = new Set()
          }
          contactsByAgent[click.agent_id].add(click.contact_id)
        }
      }
      // Calculer les contacts uniques
      for (const [agentId, contacts] of Object.entries(contactsByAgent)) {
        if (bookingStatsMap[agentId]) {
          bookingStatsMap[agentId].unique_contacts = contacts.size
        }
      }
    }

    // Calculer le taux de conversion
    for (const agentId of Object.keys(bookingStatsMap)) {
      const stats = bookingStatsMap[agentId]
      if (stats.total_proposals > 0) {
        stats.conversion_rate = Math.round((stats.total_clicks / stats.total_proposals) * 100)
      }
    }
  }

  // Ajouter booking_stats à chaque agent
  const agentsWithStats = agents.map(a => ({
    ...a,
    booking_stats: bookingStatsMap[a.id] || {
      total_proposals: 0,
      total_clicks: 0,
      unique_contacts: 0,
      conversion_rate: 0,
    },
  }))

  return NextResponse.json({ data: agentsWithStats })
}

/** POST /api/agents — Créer un nouvel agent IA */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, description, system_prompt, objective, model, temperature, is_active, response_delay_min, response_delay_max, max_messages_per_conversation, inactivity_timeout_minutes, escalation_enabled, escalation_keywords, escalation_message, booking_url, stop_condition } = body as {
    name?: string
    description?: string
    system_prompt?: string
    objective?: string
    model?: string
    temperature?: number
    is_active?: boolean
    response_delay_min?: number
    response_delay_max?: number
    max_messages_per_conversation?: number | null
    inactivity_timeout_minutes?: number | null
    escalation_enabled?: boolean
    escalation_keywords?: string[]
    escalation_message?: string
    booking_url?: string
    stop_condition?: string
    /** true = appel depuis l'étape « agent référent » de l'onboarding → upsert
     *  idempotent (met à jour l'agent existant au lieu d'en créer un doublon). */
    onboarding?: boolean
  }

  // Vérifier le quota d'agents selon le plan.
  // Exception onboarding : le 1er agent est autorisé AVANT le choix du plan
  // (l'abonnement est la DERNIÈRE étape du grand onboarding).
  let agentQuota: Awaited<ReturnType<typeof checkPlanQuota>> = await checkPlanQuota(supabase, user.id, 'agents')
  if (!agentQuota.allowed && agentQuota.reason === 'no_subscription') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle()
    const { count: agCount } = await supabase
      .from('ai_agents').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    if (!prof?.onboarding_completed_at && (agCount ?? 0) === 0) {
      agentQuota = { allowed: true }
    }
  }
  if (!agentQuota.allowed) {
    const error = agentQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des agents IA.'
      : agentQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer un agent IA. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${agentQuota.plan} inclut ${agentQuota.limit} agent(s) IA. Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: agentQuota.reason,
      limit: agentQuota.limit,
      current: agentQuota.current,
    }, { status: 403 })
  }

  if (!name?.trim() || !system_prompt?.trim()) {
    return NextResponse.json({ error: 'Nom et prompt système requis' }, { status: 400 })
  }

  const finalModel = VALID_MODELS.includes(model || '') ? model! : 'gpt-4o'
  const finalTemp = typeof temperature === 'number'
    ? Math.max(0, Math.min(2, temperature))
    : 0.7
  const finalDelayMin = typeof response_delay_min === 'number'
    ? Math.max(0, Math.min(60, Math.floor(response_delay_min)))
    : 0
  const finalDelayMax = typeof response_delay_max === 'number'
    ? Math.max(finalDelayMin, Math.min(60, Math.floor(response_delay_max)))
    : finalDelayMin

  // ⚠️ DÉFAUT = 10 (et pause à la limite). Un agent sans plafond répondait à
  // l'infini. Si le champ est absent à la création, on borne à 10 (réglable
  // ensuite, 0 = illimité). L'éditeur d'agent, lui, envoie toujours la valeur
  // choisie — donc un marchand qui met « illimité » (0/null explicite) n'est pas
  // écrasé, car il passe par PATCH, pas par ce POST de création.
  const finalMaxMessages = max_messages_per_conversation != null
    ? (Math.floor(max_messages_per_conversation) <= 0 ? null : Math.max(1, Math.min(10000, Math.floor(max_messages_per_conversation))))
    : 10
  const finalInactivityTimeout = inactivity_timeout_minutes != null
    ? Math.max(1, Math.min(10080, Math.floor(inactivity_timeout_minutes)))
    : null

  // Escalation settings
  const finalEscalationKeywords = Array.isArray(escalation_keywords)
    ? escalation_keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
    : undefined

  // Type d'agent retiré : tous les agents sont uniformes ('conversation')
  const finalAgentType = 'conversation'

  // PRÉVENTION DES DOUBLONS D'ONBOARDING : pendant l'onboarding (pas encore
  // terminé), l'étape « agent référent » peut être rejouée (retour, refresh,
  // agentId client perdu) → chaque POST créait un nouvel agent. Si le user est
  // en cours d'onboarding et a DÉJÀ un agent, on MET À JOUR le plus récent au
  // lieu d'en créer un nouveau (idempotent côté serveur, indépendant du client).
  // ⚠️ DÉSABONNEMENT — GARANTI SUR TOUTE CRÉATION D'AGENT, quel que soit le chemin.
  //
  // La consigne d'opt-out ne doit pas dépendre de l'UI qui a créé l'agent
  // (« Automatique » depuis la boutique, « Manuel » avec un prompt vierge, ou
  // généré par l'IA). C'est une règle de conformité : honorer un désabonnement
  // exprimé en langage naturel protège la qualité du numéro Meta. On l'ajoute donc
  // ICI, au seul point par lequel PASSE toute création — et on ne la duplique pas
  // si le prompt la porte déjà (agent d'onboarding, ré-onboarding).
  // Idem pour le TRANSFERT HUMAIN : une demande de conseiller doit toujours
  // déclencher une vraie prise en main, quelle que soit la config d'escalation.
  const promptTrimmed = system_prompt.trim()
  let finalPrompt = /DÉSABONNEMENT/.test(promptTrimmed)
    ? promptTrimmed
    : `${promptTrimmed}\n\n${OPT_OUT_PROMPT}`
  if (!/TRANSFERT À UN HUMAIN/.test(finalPrompt)) {
    finalPrompt = `${finalPrompt}\n\n${HANDOFF_PROMPT}`
  }

  const agentFields: Record<string, unknown> = {
    name: name.trim(),
    description: description?.trim() || null,
    system_prompt: finalPrompt,
    objective: objective?.trim() || null,
    model: finalModel,
    temperature: finalTemp,
    response_delay_min: finalDelayMin,
    response_delay_max: finalDelayMax,
    is_active: is_active !== undefined ? is_active : true,
    max_messages_per_conversation: finalMaxMessages,
    // Action à la limite : par défaut « pause_ask » → l'IA se coupe et une notif
    // demande au marchand s'il veut reprendre. « continue » (soft) laissait l'IA
    // répondre à l'infini malgré le plafond.
    max_messages_action: (body as { max_messages_action?: string }).max_messages_action || 'pause_ask',
    inactivity_timeout_minutes: finalInactivityTimeout,
    escalation_enabled: escalation_enabled ?? false,
    escalation_keywords: finalEscalationKeywords,
    escalation_message: escalation_message?.trim() || null,
    booking_url: booking_url?.trim() || null,
    agent_type: finalAgentType,
    stop_condition: stop_condition?.trim() || null,
    // Apparence : on respecte ce que le client envoie (duplication → l'agent
    // copié garde l'apparence de l'original), sinon tirage au sort.
    mascot: (body as { mascot?: string }).mascot || pickRandom(MASCOT_KEYS),
    mascot_bg: (body as { mascot_bg?: string }).mascot_bg || pickRandom(MASCOT_BG_KEYS),
  }
  // On n'applique l'upsert QUE si l'appel se déclare « onboarding » (flag envoyé
  // par l'étape agent référent) ET que l'onboarding n'est pas terminé. Ainsi la
  // création volontaire d'un 2e agent (multi-agents) n'est jamais bloquée.
  if (body.onboarding === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle()
    if (!prof?.onboarding_completed_at) {
      const { data: existing } = await supabase
        .from('ai_agents').select('id').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existing?.id) {
        // ⚠️ NE PAS écraser l'apparence sur un rejeu d'onboarding : `agentFields`
        // porte une mascotte/couleur TIRÉE AU SORT. Sans ce filtre, un marchand
        // qui revient en arrière verrait son agent changer d'apparence à chaque
        // passage. On ne la touche que si le client l'a explicitement envoyée.
        const updateFields = { ...agentFields }
        if (!(body as { mascot?: string }).mascot) delete updateFields.mascot
        if (!(body as { mascot_bg?: string }).mascot_bg) delete updateFields.mascot_bg
        const { data: updated, error: upErr } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('ai_agents').update(updateFields as any).eq('id', existing.id).eq('user_id', user.id)
          .select().single()
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
        return NextResponse.json({ data: updated })
      }
    }
  }

  const { data: agent, error } = await supabase
    .from('ai_agents')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ user_id: user.id, ...agentFields } as any)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Duplication : recopier les DOCUMENTS de l'agent source. On ne copie que les
  // lignes de liaison (agent_knowledge_documents) — les fichiers et leurs
  // embeddings sont partagés, rien n'est ré-uploadé ni recalculé.
  //
  // Les médias (knowledge_images) ne sont PAS dupliqués : ils portent une
  // contrainte d'unicité (user_id, ref) et le prompt les référence par `ref`.
  // Pour partager un média entre agents, il doit avoir agent_id = null
  // (« tous les agents ») — le dupliquer casserait le ref.
  const copyFrom = (body as { copy_knowledge_from?: string }).copy_knowledge_from
  if (copyFrom && agent) {
    try {
      // On vérifie que l'agent source appartient bien à l'utilisateur.
      const { data: src } = await supabase
        .from('ai_agents').select('id').eq('id', copyFrom).eq('user_id', user.id).maybeSingle()
      if (src) {
        const { data: links } = await supabase
          .from('agent_knowledge_documents')
          .select('document_id')
          .eq('agent_id', copyFrom)
        if (links?.length) {
          await supabase.from('agent_knowledge_documents').insert(
            links.map((l: { document_id: string }) => ({ agent_id: agent.id, document_id: l.document_id }))
          )
        }
      }
    } catch (e) {
      // Non bloquant : l'agent est créé, seuls ses documents manquent.
      console.error('[agents] copie des documents échouée:', e)
    }
  }

  return NextResponse.json({ data: agent })
}
