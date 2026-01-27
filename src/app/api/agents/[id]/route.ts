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

  const body = await req.json()
  const { name, description, system_prompt, objective, model, temperature, is_active, response_delay_min, response_delay_max } = body as {
    name?: string
    description?: string
    system_prompt?: string
    objective?: string
    model?: string
    temperature?: number
    is_active?: boolean
    response_delay_min?: number
    response_delay_max?: number
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
  if (response_delay_min !== undefined) {
    updateData.response_delay_min = Math.max(0, Math.min(30, Math.floor(Number(response_delay_min) || 0)))
  }
  if (response_delay_max !== undefined) {
    const min = typeof updateData.response_delay_min === 'number' ? updateData.response_delay_min as number : 0
    updateData.response_delay_max = Math.max(min, Math.min(30, Math.floor(Number(response_delay_max) || 0)))
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
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
