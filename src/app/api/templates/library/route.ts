import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp-cloud/default-templates'

/**
 * GET /api/templates/library
 * Renvoie la bibliothèque de modèles suggérés (DEFAULT_TEMPLATES) avec, pour
 * chacun, un flag `added` indiquant si le marchand l'a déjà ajouté (nom+langue).
 * Sert la galerie « Modèles suggérés » de la page Templates.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('name, language')
    .eq('user_id', user.id)

  const existingKeys = new Set((existing || []).map((t) => `${t.name}|${t.language}`))

  const data = DEFAULT_TEMPLATES.map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    name: t.name,
    language: t.language,
    use_case: t.use_case,
    body_text: t.body_text,
    added: existingKeys.has(`${t.name}|${t.language}`),
  }))

  return NextResponse.json({ data })
}
