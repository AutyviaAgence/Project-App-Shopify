import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { translateTemplateRow } from '@/lib/templates/translate'

/**
 * POST /api/templates/translate  { source_template_id }
 *
 * Décline un modèle (la "langue source") dans toutes les autres langues
 * (TEMPLATE_LANGUAGES) via traduction IA. La logique vit dans
 * translateTemplateRow (partagée avec l'onboarding apply-pack).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sourceId = String(body.source_template_id || '')
  if (!sourceId) return NextResponse.json({ error: 'source_template_id requis' }, { status: 400 })

  const { created, skipped } = await translateTemplateRow(supabase, user.id, sourceId)
  if (created.length === 0 && skipped.length === 0) {
    return NextResponse.json({ error: 'Modèle source introuvable' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, created, skipped })
}
