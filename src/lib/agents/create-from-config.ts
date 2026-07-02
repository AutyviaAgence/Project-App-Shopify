// Helper partagé : crée un agent à partir d'une config générée (wizard / onboarding),
// puis crée optionnellement un document de connaissance (RAG) rattaché à l'agent.

export interface AgentCreateConfig {
  name: string
  description?: string
  system_prompt: string
  objective?: string
  agent_type?: 'conversation'
  escalation_enabled?: boolean
  escalation_mode?: 'keywords' | 'ai' | 'both'
  escalation_keywords?: string[]
  escalation_message?: string
  booking_url?: string | null
  schedule_enabled?: boolean
  schedule_start_time?: string
  schedule_end_time?: string
  schedule_days?: number[]
  /** Contenu de connaissance à créer et rattacher (optionnel). */
  ragContent?: string
}

export type CreateAgentResult =
  | { ok: true; agent: { id: string; name: string }; kbCreated: boolean }
  | { ok: false; error: string }

/**
 * Crée l'agent puis (si fourni) le document RAG. Renvoie l'agent créé.
 * Centralise l'enchaînement POST /api/agents -> POST /api/knowledge utilisé par
 * le wizard et l'onboarding.
 */
export async function createAgentFromConfig(config: AgentCreateConfig): Promise<CreateAgentResult> {
  // 1. Créer l'agent
  const agentRes = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: config.name,
      description: config.description || null,
      system_prompt: config.system_prompt,
      objective: config.objective || null,
      model: 'gpt-4o',
      temperature: 0.7,
      response_delay_min: 30,
      response_delay_max: 120,
      agent_type: config.agent_type || 'conversation',
      escalation_enabled: config.escalation_enabled ?? false,
      escalation_mode: config.escalation_mode || 'keywords',
      escalation_keywords: config.escalation_keywords || [],
      escalation_message: config.escalation_message || null,
      booking_url: config.booking_url || null,
      schedule_enabled: config.schedule_enabled ?? false,
      schedule_timezone: 'Europe/Paris',
      schedule_start_time: config.schedule_start_time || '09:00',
      schedule_end_time: config.schedule_end_time || '18:00',
      schedule_days: config.schedule_days || [1, 2, 3, 4, 5],
      auto_detect_language: true,
    }),
  })

  const agentJson = await agentRes.json()
  if (!agentRes.ok || !agentJson.data) {
    return { ok: false, error: agentJson.error || 'Erreur lors de la création de l\'agent' }
  }

  const agent = agentJson.data as { id: string; name: string }

  // 2. Document RAG optionnel
  let kbCreated = false
  if (config.ragContent && config.ragContent.trim()) {
    try {
      const ragRes = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Informations - ${config.name}`,
          content: config.ragContent,
          agent_ids: [agent.id],
        }),
      })
      kbCreated = ragRes.ok
    } catch {
      kbCreated = false
    }
  }

  return { ok: true, agent, kbCreated }
}
