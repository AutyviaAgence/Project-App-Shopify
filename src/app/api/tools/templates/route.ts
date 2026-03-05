import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TOOL_TEMPLATES } from '@/lib/tools/templates'

/** GET /api/tools/templates — List available tool templates */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const templates = Object.values(TOOL_TEMPLATES).map(t => ({
    type: t.type,
    name: t.name,
    description: t.description,
    icon: t.icon,
    auth_type: t.auth.type,
    auth_fields: t.auth.fields.map(f => ({ key: f.key, label: f.label, placeholder: f.placeholder, secret: f.secret })),
    functions: t.functions.map(fn => ({
      name: fn.name,
      description: fn.description,
      permission: fn.permission,
      parameters: fn.parameters,
    })),
  }))

  // Add custom API option
  templates.push({
    type: 'custom' as any,
    name: 'API personnalisée',
    description: 'Connect any REST API with custom endpoints',
    icon: 'plug',
    auth_type: 'api_key' as any,
    auth_fields: [
      { key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com', secret: false },
      { key: 'auth_type', label: 'Auth Type', placeholder: 'bearer / api_key / basic', secret: false },
      { key: 'api_key', label: 'API Key / Token', placeholder: '', secret: true },
    ],
    functions: [],
  })

  return NextResponse.json({ data: templates })
}
