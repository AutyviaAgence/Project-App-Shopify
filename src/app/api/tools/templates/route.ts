import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OFFERED_TOOL_TEMPLATES } from '@/lib/tools/templates'

/** GET /api/tools/templates — List available tool templates */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Seuls WhatsApp Message et Notification App sont proposés (cf.
  // OFFERED_TOOL_TEMPLATES). Shopify/WooCommerce/Stripe/Google Sheets et
  // l'« API personnalisée » ne sont plus offerts à la création ; les agents
  // qui en ont déjà un configuré continuent de l'exécuter normalement.
  const templates = OFFERED_TOOL_TEMPLATES.map(t => ({
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

  return NextResponse.json({ data: templates })
}
