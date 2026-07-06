import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o']

/** GET /api/agents/[id] — Détail d'un agent */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  return NextResponse.json({ data: agent })
}

/** PATCH /api/agents/[id] — Modifier un agent */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer l'agent actuel pour vérifier l'accès
  const { data: existingAgent } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existingAgent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const {
    name, description, system_prompt, objective, model, temperature, is_active, is_pinned, is_default,
    response_delay_min, response_delay_max, max_messages_per_conversation, inactivity_timeout_minutes,
    schedule_enabled, schedule_timezone, schedule_start_time, schedule_end_time, schedule_days,
    auto_detect_language, escalation_enabled, escalation_keywords, escalation_message, booking_url,
    stop_condition, mascot, mascot_bg
  } = body as {
    name?: string
    description?: string
    system_prompt?: string
    objective?: string
    model?: string
    temperature?: number
    is_active?: boolean
    is_pinned?: boolean
    is_default?: boolean
    response_delay_min?: number
    response_delay_max?: number
    max_messages_per_conversation?: number | null
    inactivity_timeout_minutes?: number | null
    schedule_enabled?: boolean
    schedule_timezone?: string
    schedule_start_time?: string
    schedule_end_time?: string
    schedule_days?: number[]
    auto_detect_language?: boolean
    escalation_enabled?: boolean
    escalation_keywords?: string[]
    escalation_message?: string
    booking_url?: string
    stop_condition?: string | null
    mascot?: string | null
    mascot_bg?: string | null
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (system_prompt !== undefined) updateData.system_prompt = system_prompt.trim()
  if (objective !== undefined) updateData.objective = objective?.trim() || null
  if (model !== undefined) {
    updateData.model = VALID_MODELS.includes(model) ? model : 'gpt-4o-mini'
  }
  if (temperature !== undefined) {
    updateData.temperature = Math.max(0, Math.min(2, Number(temperature) || 0.7))
  }
  if (is_active !== undefined) updateData.is_active = is_active
  if (is_pinned !== undefined) updateData.is_pinned = is_pinned
  if (is_default !== undefined) updateData.is_default = Boolean(is_default)
  if (mascot !== undefined) updateData.mascot = mascot
  if (mascot_bg !== undefined) updateData.mascot_bg = mascot_bg
  if (response_delay_min !== undefined) {
    updateData.response_delay_min = Math.max(0, Math.min(30, Math.floor(Number(response_delay_min) || 0)))
  }
  if (response_delay_max !== undefined) {
    const min = typeof updateData.response_delay_min === 'number' ? updateData.response_delay_min as number : 0
    updateData.response_delay_max = Math.max(min, Math.min(30, Math.floor(Number(response_delay_max) || 0)))
  }
  if (max_messages_per_conversation !== undefined) {
    updateData.max_messages_per_conversation = max_messages_per_conversation != null
      ? Math.max(1, Math.min(10000, Math.floor(max_messages_per_conversation)))
      : null
  }
  if (inactivity_timeout_minutes !== undefined) {
    updateData.inactivity_timeout_minutes = inactivity_timeout_minutes != null
      ? Math.max(1, Math.min(10080, Math.floor(inactivity_timeout_minutes)))
      : null
  }

  // Schedule fields
  if (schedule_enabled !== undefined) {
    updateData.schedule_enabled = Boolean(schedule_enabled)
  }
  if (schedule_timezone !== undefined) {
    updateData.schedule_timezone = schedule_timezone || 'Europe/Paris'
  }
  if (schedule_start_time !== undefined) {
    // Validate HH:MM format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    updateData.schedule_start_time = timeRegex.test(schedule_start_time) ? schedule_start_time : '09:00'
  }
  if (schedule_end_time !== undefined) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    updateData.schedule_end_time = timeRegex.test(schedule_end_time) ? schedule_end_time : '18:00'
  }
  if (schedule_days !== undefined) {
    // Validate days array (0-6)
    const validDays = Array.isArray(schedule_days)
      ? schedule_days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
      : [1, 2, 3, 4, 5]
    updateData.schedule_days = validDays.length > 0 ? validDays : [1, 2, 3, 4, 5]
  }

  // Auto-detect language
  if (auto_detect_language !== undefined) {
    updateData.auto_detect_language = Boolean(auto_detect_language)
  }

  // Escalation (garde-fou)
  if (escalation_enabled !== undefined) {
    updateData.escalation_enabled = Boolean(escalation_enabled)
  }
  if (escalation_keywords !== undefined) {
    // Filtrer et nettoyer les mots-clés
    const cleanedKeywords = Array.isArray(escalation_keywords)
      ? escalation_keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
      : []
    updateData.escalation_keywords = cleanedKeywords
  }
  if (escalation_message !== undefined) {
    updateData.escalation_message = escalation_message?.trim() || null
  }

  // Lien de rendez-vous
  if (booking_url !== undefined) {
    updateData.booking_url = booking_url?.trim() || null
  }

  // Condition d'arrêt
  if (stop_condition !== undefined) {
    updateData.stop_condition = stop_condition?.trim() || null
  }

  // Agent référent : au plus un par utilisateur. Avant de marquer celui-ci, on
  // démarque l'éventuel autre agent référent (sinon l'index unique partiel rejette).
  if (is_default === true) {
    await supabase
      .from('ai_agents')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
      .neq('id', id)
  }

  // Mise à jour si nécessaire
  let agent = existingAgent
  if (Object.keys(updateData).length > 0) {
    const { data: updatedAgent, error } = await supabase
      .from('ai_agents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updatedAgent) {
      return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
    }
    agent = updatedAgent
  }

  return NextResponse.json({ data: agent })
}

/** DELETE /api/agents/[id] — Supprimer un agent */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { error } = await supabase
    .from('ai_agents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
