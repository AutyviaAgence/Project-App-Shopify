import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { submitTemplateRow } from '@/lib/templates/submit'

/**
 * POST /api/templates/submit-group  { name }
 *
 * Soumet à Meta TOUTES les variantes linguistiques d'un modèle (même `name`).
 * Chaque langue est un template Meta indépendant : on les soumet en séquence et
 * on renvoie un résultat PAR langue. Un échec (ex : limite 1 édition/24h sur une
 * langue) n'empêche pas les autres d'être soumises.
 *
 * Appelle submitTemplateRow EN PROCESS (pas de self-fetch HTTP, qui échoue en
 * self-hosted Dokploy → "fetch failed").
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '')
  if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 })

  // Toutes les variantes (langues) de ce modèle. On soumet tout sauf ce qui est
  // déjà 'approved' SANS modifications en attente.
  const { data: rows } = await supabase
    .from('whatsapp_templates')
    .select('id, language, status, has_pending_changes')
    .eq('user_id', user.id)
    .eq('name', name)
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 })
  }

  const toSubmit = rows.filter((r) => !(r.status === 'approved' && !r.has_pending_changes))

  const results: { language: string; ok: boolean; error?: string }[] = []
  for (const r of toSubmit) {
    try {
      const sr = await submitTemplateRow(supabase, user.id, r.id)
      results.push({ language: r.language, ok: sr.ok, error: sr.ok ? undefined : sr.error })
    } catch (e) {
      results.push({ language: r.language, ok: false, error: e instanceof Error ? e.message : 'erreur' })
    }
  }

  // Langues déjà approuvées et à jour (non resoumises) → signalées comme telles.
  const alreadyOk = rows
    .filter((r) => r.status === 'approved' && !r.has_pending_changes)
    .map((r) => ({ language: r.language, ok: true as const }))

  const all = [...results, ...alreadyOk]
  const okCount = all.filter((r) => r.ok).length
  return NextResponse.json({ ok: okCount > 0, submitted: results.length, results: all })
}
