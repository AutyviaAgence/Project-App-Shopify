import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TEMPLATE_LANGUAGES } from '@/lib/i18n/contact-language'
import { translateTemplateContent, type TranslatableContent } from '@/lib/templates/translate'
import type { TemplateButton, TemplateCard } from '@/types/database'

/** Compte les variables {{1}}, {{2}}… dans un texte. */
function countVariables(text: string): number {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g)
  if (!matches) return 0
  const nums = matches.map((m) => parseInt(m.replace(/\D/g, ''), 10))
  return nums.length ? Math.max(...nums) : 0
}

/**
 * POST /api/templates/translate  { source_template_id }
 *
 * Décline un modèle (la "langue source") dans toutes les autres langues
 * (TEMPLATE_LANGUAGES) via traduction IA. Crée/met à jour une ligne par langue
 * cible (status draft, is_auto_translated=true). Ne réécrit JAMAIS une langue
 * déjà éditée à la main (is_auto_translated=false avec du contenu).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sourceId = String(body.source_template_id || '')
  if (!sourceId) return NextResponse.json({ error: 'source_template_id requis' }, { status: 400 })

  // Modèle source
  const { data: src } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('id', sourceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!src) return NextResponse.json({ error: 'Modèle source introuvable' }, { status: 404 })

  const sourceLang = src.language as string
  const targets = TEMPLATE_LANGUAGES.filter((l) => l !== sourceLang)

  // Marque la ligne source comme telle (et non auto-traduite).
  await supabase
    .from('whatsapp_templates')
    .update({ source_language: sourceLang, is_auto_translated: false })
    .eq('id', src.id)

  // Siblings existantes (même nom) pour décider quoi écraser.
  const { data: siblings } = await supabase
    .from('whatsapp_templates')
    .select('id, language, is_auto_translated, body_text')
    .eq('user_id', user.id)
    .eq('name', src.name)

  const sourceContent: TranslatableContent = {
    body_text: src.body_text,
    header_text: src.header_text,
    footer_text: src.footer_text,
    buttons: src.buttons as TemplateButton[] | null,
    carousel_cards: src.carousel_cards as TemplateCard[] | null,
    lto_title: src.lto_title,
  }

  const created: string[] = []
  const skipped: string[] = []

  // Traductions en parallèle.
  const translations = await Promise.all(
    targets.map(async (lang) => ({
      lang,
      content: await translateTemplateContent({ source: sourceContent, sourceLang, targetLang: lang }),
    }))
  )

  for (const { lang, content } of translations) {
    const existing = (siblings || []).find((s) => s.language === lang)
    // Langue déjà éditée à la main (et non vide) → on ne touche pas.
    if (existing && existing.is_auto_translated === false && (existing.body_text || '').trim()) {
      skipped.push(lang)
      continue
    }

    const row = {
      user_id: user.id,
      session_id: src.session_id,
      name: src.name,
      language: lang,
      category: src.category,
      body_text: content.body_text,
      header_text: content.header_text ?? null,
      footer_text: content.footer_text ?? null,
      header_type: src.header_type,
      header_media_url: src.header_media_url,
      buttons: content.buttons ?? null,
      template_type: src.template_type,
      carousel_cards: content.carousel_cards ?? null,
      lto_title: content.lto_title ?? null,
      lto_default_hours: src.lto_default_hours,
      variables_count: countVariables(content.body_text),
      sample_values: src.sample_values,
      variable_keys: src.variable_keys,
      status: 'draft' as const,
      source_language: sourceLang,
      is_auto_translated: true,
      auto_translated_at: new Date().toISOString(),
      // Une traduction repart de zéro côté Meta : pas d'héritage meta_id / approved_*.
      meta_id: null,
      has_pending_changes: false,
    }

    const { error } = await supabase
      .from('whatsapp_templates')
      .upsert(row, { onConflict: 'user_id,name,language' })
    if (error) {
      console.error('[translate] upsert échec', lang, error.message)
      skipped.push(lang)
    } else {
      created.push(lang)
    }
  }

  return NextResponse.json({ ok: true, source_language: sourceLang, created, skipped })
}
