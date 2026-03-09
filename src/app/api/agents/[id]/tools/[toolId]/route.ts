import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { encryptToolConfig } from '@/lib/tools/executor'
import { validateToolUrl } from '@/lib/tools/security'

/** PATCH /api/agents/[id]/tools/[toolId] — Update a tool */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const { id, toolId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.permissions !== undefined) updates.permissions = body.permissions
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.rate_limit !== undefined) updates.rate_limit = body.rate_limit
  if (body.credential_id !== undefined) updates.credential_id = body.credential_id || null

  if (body.config !== undefined) {
    // Validate URLs for custom tools
    if (body.config.base_url) {
      const urlCheck = validateToolUrl(body.config.base_url)
      if (!urlCheck.valid) {
        return NextResponse.json({ error: urlCheck.error }, { status: 400 })
      }
    }
    updates.config = encryptToolConfig(body.config)
  }

  updates.updated_at = new Date().toISOString()

  const { data: tool, error } = await supabase
    .from('agent_tools')
    .update(updates)
    .eq('id', toolId)
    .eq('agent_id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tool) {
    return NextResponse.json({ error: 'Outil introuvable' }, { status: 404 })
  }

  return NextResponse.json({ data: tool })
}

/** DELETE /api/agents/[id]/tools/[toolId] — Delete a tool */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const { id, toolId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Verify ownership via agent (old tools may have user_id = NULL)
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  // Use pure admin client (no cookies) to bypass RLS for delete
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: deleted, error } = await adminSupabase
    .from('agent_tools')
    .delete()
    .eq('id', toolId)
    .eq('agent_id', id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Suppression échouée' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
