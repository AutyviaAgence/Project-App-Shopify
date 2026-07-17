import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { translateTemplateRow } from '@/lib/templates/translate'
import { TEMPLATE_LANGUAGES } from '@/lib/i18n/contact-language'
import { submitTemplateRow } from '@/lib/templates/submit'

/**
 * POST /api/templates/backfill-translations
 *
 * Rattrape les modèles créés AVANT la traduction automatique : ceux qui n'ont
 * qu'une seule langue restaient français-seulement, sans que rien ne le signale.
 * Constaté en production : 9 modèles sur 23 (des défauts de juin/juillet) — un
 * contact anglophone recevait donc du français.
 *
 * Les chemins récents (onboarding apply-pack, seed, from-suggestion) traduisent
 * déjà à la création ; rien n'était jamais repassé sur l'existant.
 *
 * ── IDEMPOTENT ──────────────────────────────────────────────────────────────
 * `translateTemplateRow` saute les langues déjà présentes : rejouer cette route
 * ne recrée rien et ne re-soumet rien. On peut la relancer sans risque.
 *
 * ── SOUMISSION ──────────────────────────────────────────────────────────────
 * Même règle que /api/templates/translate : la variante n'est soumise à Meta que
 * si sa SOURCE est déjà approuvée. Sinon l'anglais resterait un brouillon
 * éternel — le dispatch n'envoie que de l'approuvé, donc l'anglophone recevrait
 * du français malgré la traduction.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: all } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, status, source_language, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const rows = (all || []) as {
    id: string; name: string; language: string; status: string
    source_language: string | null; created_at: string
  }[]

  // Groupe par NOM : les variantes linguistiques d'un même modèle partagent le
  // nom (c'est la clé côté Meta, avec la langue).
  const byName = new Map<string, typeof rows>()
  for (const t of rows) {
    const list = byName.get(t.name) || []
    list.push(t)
    byName.set(t.name, list)
  }

  const report: { name: string; created: string[]; submitted: number; error?: string }[] = []

  for (const [name, list] of byName) {
    const langs = new Set(list.map((t) => t.language))
    const missing = TEMPLATE_LANGUAGES.filter((l) => !langs.has(l))
    if (missing.length === 0) continue

    // Source = la variante dans la langue d'origine, à défaut le FR, à défaut la
    // plus ancienne. On préfère une source APPROUVÉE : son contenu est validé par
    // Meta, donc la traduction part d'un texte sûr — et c'est elle qui autorise
    // la soumission automatique.
    const source =
      list.find((t) => t.status === 'approved' && (t.source_language ? t.language === t.source_language : t.language === 'fr'))
      || list.find((t) => t.status === 'approved')
      || list.find((t) => t.language === 'fr')
      || list[0]
    if (!source) continue

    try {
      const { created } = await translateTemplateRow(supabase, user.id, source.id)
      let submitted = 0

      // Soumission : uniquement si la source est approuvée (cf. en-tête).
      if (created.length > 0 && source.status === 'approved') {
        const { data: variants } = await supabase
          .from('whatsapp_templates')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', name)
          .in('language', created)
        for (const v of (variants || []) as { id: string }[]) {
          const r = await submitTemplateRow(supabase, user.id, v.id)
          if (r.ok) submitted++
          else console.warn(`[backfill-translations] soumission refusée : ${name}`, r.error)
        }
      }
      report.push({ name, created, submitted })
    } catch (e) {
      // Un modèle qui échoue ne doit pas arrêter les autres : on note et on
      // continue. Le rapport dit exactement ce qui est passé et ce qui a raté.
      console.error(`[backfill-translations] échec ${name}:`, e)
      report.push({ name, created: [], submitted: 0, error: e instanceof Error ? e.message : 'erreur' })
    }
  }

  return NextResponse.json({
    ok: true,
    traites: report.length,
    crees: report.reduce((s, r) => s + r.created.length, 0),
    soumis: report.reduce((s, r) => s + r.submitted, 0),
    echecs: report.filter((r) => r.error).length,
    detail: report,
  })
}
