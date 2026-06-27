import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp-cloud/default-templates'

/**
 * POST /api/templates/seed
 * Crée des copies locales (brouillons) des modèles par défaut pour l'utilisateur.
 * Ignore les modèles déjà présents (même nom + langue).
 *
 * Body optionnel { key } : n'ajoute QUE ce modèle (galerie, ajout à l'unité).
 * Sans key : ajoute tous les modèles manquants (bouton « Modèles par défaut »).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const onlyKey = typeof body.key === 'string' ? body.key : null

  // Modèles déjà existants (pour éviter les doublons)
  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('name, language')
    .eq('user_id', user.id)

  const existingKeys = new Set((existing || []).map((t) => `${t.name}|${t.language}`))

  const source = onlyKey ? DEFAULT_TEMPLATES.filter((t) => t.key === onlyKey) : DEFAULT_TEMPLATES
  const toInsert = source
    .filter((t) => !existingKeys.has(`${t.name}|${t.language}`))
    .map((t) => ({
      user_id: user.id,
      name: t.name,
      language: t.language,
      category: t.category,
      use_case: t.use_case,
      header_text: t.header_text || null,
      body_text: t.body_text,
      footer_text: t.footer_text || null,
      variables_count: t.sample_values.length,
      sample_values: t.sample_values,
      variable_keys: t.variable_keys,
      status: 'draft' as const,
    }))

  if (toInsert.length === 0) {
    return NextResponse.json({ data: { created: 0 } })
  }

  const { error } = await supabase.from('whatsapp_templates').insert(toInsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { created: toInsert.length } })
}
