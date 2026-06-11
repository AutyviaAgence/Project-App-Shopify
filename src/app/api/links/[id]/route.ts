import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** PATCH /api/links/[id] — Modifier un lien WA */
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

  // Récupérer le lien actuel pour vérifier l'accès
  const { data: existingLink } = await supabase
    .from('wa_links')
    .select('*')
    .eq('id', id)
    .single()

  if (!existingLink) {
    return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  }

  // Vérifier l'accès au lien (propriétaire uniquement)
  if (existingLink.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { name, pre_filled_message, tracking_source, slug, is_active, ai_agent_id } = body as {
    name?: string
    pre_filled_message?: string
    tracking_source?: string
    slug?: string
    is_active?: boolean
    ai_agent_id?: string | null
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (pre_filled_message !== undefined) updateData.pre_filled_message = pre_filled_message || null
  if (tracking_source !== undefined) updateData.tracking_source = tracking_source || null
  if (slug !== undefined) updateData.slug = slug.trim() || null
  if (is_active !== undefined) updateData.is_active = is_active
  if (ai_agent_id !== undefined) updateData.ai_agent_id = ai_agent_id

  // Mise à jour si nécessaire
  let link = existingLink
  if (Object.keys(updateData).length > 0) {
    const { data: updatedLink, error } = await supabase
      .from('wa_links')
      .update(updateData)
      .eq('id', id)
      .select('*, whatsapp_sessions(phone_number, instance_name, status)')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updatedLink) {
      return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
    }
    link = updatedLink
  }

  return NextResponse.json({ data: link })
}

/** DELETE /api/links/[id] — Supprimer un lien WA */
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
    .from('wa_links')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
