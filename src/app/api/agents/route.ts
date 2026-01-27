import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o']

/** GET /api/agents — Lister les agents IA de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: agents, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: agents })
}

/** POST /api/agents — Créer un nouvel agent IA */
export async function POST(req: Request) {
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

  if (!name?.trim() || !system_prompt?.trim()) {
    return NextResponse.json({ error: 'Nom et prompt système requis' }, { status: 400 })
  }

  const finalModel = VALID_MODELS.includes(model || '') ? model! : 'gpt-4o-mini'
  const finalTemp = typeof temperature === 'number'
    ? Math.max(0, Math.min(2, temperature))
    : 0.7
  const finalDelayMin = typeof response_delay_min === 'number'
    ? Math.max(0, Math.min(30, Math.floor(response_delay_min)))
    : 0
  const finalDelayMax = typeof response_delay_max === 'number'
    ? Math.max(finalDelayMin, Math.min(30, Math.floor(response_delay_max)))
    : finalDelayMin

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .insert({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      system_prompt: system_prompt.trim(),
      objective: objective?.trim() || null,
      model: finalModel,
      temperature: finalTemp,
      response_delay_min: finalDelayMin,
      response_delay_max: finalDelayMax,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: agent })
}
