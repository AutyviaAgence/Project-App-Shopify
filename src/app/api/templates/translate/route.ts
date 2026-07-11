import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { translateTemplateRow } from '@/lib/templates/translate'
import { submitTemplateRow } from '@/lib/templates/submit'

/**
 * POST /api/templates/translate  { source_template_id }
 *
 * Décline un modèle (la "langue source") dans toutes les autres langues
 * (TEMPLATE_LANGUAGES) via traduction IA. La logique vit dans
 * translateTemplateRow (partagée avec l'onboarding apply-pack).
 *
 * Auto-soumission : si la source est DÉJÀ APPROUVÉE (contenu validé), on soumet
 * automatiquement les variantes traduites à Meta dans la foulée — sinon elles
 * restaient en brouillon et l'utilisateur devait penser à les soumettre une par
 * une (les contacts non-francophones recevaient alors le français par défaut).
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

  // Auto-soumission des variantes si la source est approuvée. `created` contient
  // les CODES LANGUE créés → on retrouve les IDs des variantes (même nom) pour
  // les soumettre à Meta.
  let submitted: string[] = []
  if (created.length > 0) {
    const { data: src } = await supabase
      .from('whatsapp_templates').select('status, name').eq('id', sourceId).eq('user_id', user.id).maybeSingle()
    if (src?.status === 'approved' && src.name) {
      const { data: variants } = await supabase
        .from('whatsapp_templates')
        .select('id, language')
        .eq('user_id', user.id)
        .eq('name', src.name)
        .in('language', created)
      const results = await Promise.all(
        (variants || []).map(async (v: { id: string }) => {
          const r = await submitTemplateRow(supabase, user.id, v.id)
          return r.ok ? v.id : null
        })
      )
      submitted = results.filter((x): x is string => !!x)
    }
  }

  return NextResponse.json({ ok: true, created, skipped, submitted })
}
