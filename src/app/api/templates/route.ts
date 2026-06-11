import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TemplateButton } from '@/types/database'

/** Compte les variables {{1}}, {{2}}… dans un texte */
function countVariables(text: string): number {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g)
  if (!matches) return 0
  const nums = matches.map((m) => parseInt(m.replace(/\D/g, ''), 10))
  return nums.length ? Math.max(...nums) : 0
}

/** GET /api/templates — Liste des modèles de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('id, session_id, meta_id, name, language, category, body_text, header_text, footer_text, header_type, header_media_url, buttons, variables_count, sample_values, status, rejection_reason, approved_body_text, approved_header_text, approved_footer_text, approved_at, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/templates — Créer un modèle (brouillon local) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { session_id, name, language, category, body_text, header_text, footer_text, sample_values, header_type, header_media_url, buttons } = body as {
    session_id?: string
    name?: string
    language?: string
    category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    body_text?: string
    header_text?: string
    footer_text?: string
    sample_values?: string[]
    header_type?: 'none' | 'text' | 'image' | 'video' | 'document'
    header_media_url?: string | null
    buttons?: unknown[] | null
  }

  if (!name?.trim() || !body_text?.trim()) {
    return NextResponse.json({ error: 'Nom et corps du message requis' }, { status: 400 })
  }

  // Nom technique : minuscules, chiffres, underscore (contrainte Meta)
  const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 512)

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .insert({
      user_id: user.id,
      session_id: session_id || null,
      name: safeName,
      language: language || 'fr',
      category: category || 'UTILITY',
      body_text: body_text.trim(),
      header_text: header_text?.trim() || null,
      footer_text: footer_text?.trim() || null,
      header_type: header_type || 'none',
      header_media_url: header_media_url || null,
      buttons: buttons && buttons.length > 0 ? (buttons as TemplateButton[]) : null,
      variables_count: countVariables(body_text),
      sample_values: sample_values || null,
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Un modèle avec ce nom et cette langue existe déjà' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
