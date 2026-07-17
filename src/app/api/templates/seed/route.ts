import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp-cloud/default-templates'
import { translateTemplateRow } from '@/lib/templates/translate'
import { canCreateContent } from '@/lib/plans/gate'

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

  const gate = await canCreateContent(user.id)
  if (!gate.allowed) return NextResponse.json({ error: 'La création de modèles nécessite un plan payant.', upgrade: true }, { status: 403 })

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

  const { data: inserted, error } = await supabase
    .from('whatsapp_templates').insert(toInsert).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ⚠️ TRADUCTION AUTOMATIQUE — les 11 modèles par défaut sont écrits en FRANÇAIS.
  //
  // Le dispatch choisit la variante selon la langue du contact : sans version
  // anglaise, un client anglophone reçoit du français. Un marchand qui clique
  // « Modèles par défaut » se retrouvait avec un catalogue 100 % FR sans l'avoir
  // choisi — et sans savoir qu'il devait traduire.
  //
  // On réutilise la traduction auto (comme l'onboarding) plutôt que d'écrire 11
  // versions anglaises à la main : elles divergeraient au premier changement de
  // formulation, et il faudrait les maintenir en double.
  //
  // En tâche post-réponse : le marchand voit ses modèles tout de suite. Best
  // effort — une traduction ratée ne doit pas faire échouer le seed.
  const ids = (inserted || []).map((r) => r.id as string)
  const userId = user.id
  if (ids.length > 0) {
    after(async () => {
      try {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const res = await Promise.allSettled(ids.map((id) => translateTemplateRow(admin, userId, id)))
        const ko = res.filter((r) => r.status === 'rejected').length
        console.log(`[seed] traductions : ${ids.length - ko}/${ids.length} ok`)
      } catch (e) {
        console.error('[seed] traduction:', e)
      }
    })
  }

  return NextResponse.json({ data: { created: toInsert.length } })
}
