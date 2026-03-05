import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptToolConfig, decryptToolConfig } from '@/lib/tools/executor'
import { validateToolUrl } from '@/lib/tools/security'

/** GET /api/agents/[id]/tools — List tools for an agent */
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

  const { data: tools, error } = await supabase
    .from('agent_tools')
    .select('*')
    .eq('agent_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Decrypt configs for display (mask secrets)
  const safeTools = (tools || []).map(tool => {
    const decrypted = decryptToolConfig(tool.config || {})
    const masked: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(decrypted)) {
      if (typeof value === 'string' && isSecretKey(key) && value.length > 8) {
        masked[key] = value.slice(0, 4) + '****' + value.slice(-4)
      } else {
        masked[key] = value
      }
    }
    return { ...tool, config: masked }
  })

  return NextResponse.json({ data: safeTools })
}

/** POST /api/agents/[id]/tools — Create a new tool */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Verify agent ownership
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const { tool_type, name, description, config, permissions, rate_limit } = body

  if (!name || !description || !tool_type) {
    return NextResponse.json({ error: 'name, description et tool_type sont requis' }, { status: 400 })
  }

  // Validate custom tool URLs
  if (tool_type === 'custom' && config?.base_url) {
    const urlCheck = validateToolUrl(config.base_url)
    if (!urlCheck.valid) {
      return NextResponse.json({ error: urlCheck.error }, { status: 400 })
    }
  }

  // Encrypt sensitive config fields
  const encryptedConfig = encryptToolConfig(config || {})

  const { data: tool, error } = await supabase
    .from('agent_tools')
    .insert({
      agent_id: id,
      user_id: user.id,
      tool_type: tool_type || 'custom',
      name,
      description,
      config: encryptedConfig,
      permissions: permissions || 'read',
      rate_limit: rate_limit || 60,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: tool }, { status: 201 })
}

function isSecretKey(key: string): boolean {
  const secrets = ['access_token', 'refresh_token', 'api_key', 'consumer_key', 'consumer_secret', 'secret', 'password', 'token']
  return secrets.some(s => key.toLowerCase().includes(s))
}
