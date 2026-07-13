import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { defaultGraph } from '@/lib/automations/graph-types'
import { translateTemplateRow } from '@/lib/templates/translate'
import type { TriggerEvent } from '@/lib/automations/types'
import { kindForTrigger } from '@/lib/automations/types'
import type { OnboardingPack } from '@/lib/onboarding/pack-spec'

/**
 * POST /api/onboarding/apply-pack
 *
 * Persiste UNIQUEMENT les éléments du pack VALIDÉS par le marchand.
 * Idempotent : un modèle déjà présent (name|language) ou une automatisation
 * déjà créée pour un trigger du pack n'est jamais dupliqué.
 *
 * Body :
 *  - { templates: TriggerEvent[] }  → crée les modèles cochés (brouillons)
 *  - { automations: { trigger, delay_minutes }[] } → crée les automatisations
 *    cochées (INACTIVES — le marchand les active quand il veut), reliées au
 *    modèle du même trigger.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    templates?: string[]
    automations?: { trigger: string; delay_minutes?: number }[]
    /** corps modifiés par le marchand avant validation ({{n}} conservés) */
    edited?: { trigger: string; body_text: string }[]
  }

  // Le pack de référence (généré + éventuellement édité côté client ? Non :
  // la source de vérité serveur reste le cache — les corps édités arrivent
  // via body.edited ci-dessous si fournis).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles').select('onboarding_pack').eq('id', user.id).maybeSingle()
  const pack = profile?.onboarding_pack as OnboardingPack | null
  if (!pack?.items?.length) return NextResponse.json({ error: 'Aucun pack généré.' }, { status: 400 })

  const byTrigger = new Map(pack.items.map((i) => [i.trigger as string, i]))
  let templatesCreated = 0
  let automationsCreated = 0

  // ── 0. Éditions du marchand : on les applique au pack (et au cache) ────
  if (Array.isArray(body.edited) && body.edited.length > 0) {
    const { isValidBody } = await import('@/lib/onboarding/pack-spec')
    let touched = false
    for (const e of body.edited) {
      const item = byTrigger.get(e.trigger)
      if (item && typeof e.body_text === 'string' && isValidBody(e.body_text, item.variable_keys.length)) {
        item.body_text = e.body_text.trim()
        touched = true
      }
    }
    if (touched) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('profiles').update({ onboarding_pack: pack }).eq('id', user.id)
    }
  }

  // ── 1. Modèles validés ────────────────────────────────────────────────
  if (Array.isArray(body.templates) && body.templates.length > 0) {
    const { data: existing } = await supabase
      .from('whatsapp_templates')
      .select('name, language')
      .eq('user_id', user.id)
    const existingKeys = new Set((existing || []).map((t) => `${t.name}|${t.language}`))

    const toInsert = body.templates
      .map((tr) => byTrigger.get(tr))
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .filter((i) => !existingKeys.has(`${i.templateName}|${pack.language}`))
      .map((i) => ({
        user_id: user.id,
        name: i.templateName,
        language: pack.language,
        category: i.category,
        use_case: i.use_case,
        header_text: i.header_text,
        body_text: i.body_text,
        footer_text: i.footer_text,
        variables_count: i.sample_values.length,
        sample_values: i.sample_values,
        variable_keys: i.variable_keys,
        // Boutons de la spec (URL boutique résolue, quick replies SAV).
        // `?? null` : packs générés AVANT cette fonctionnalité (cache profil).
        buttons: i.buttons ?? null,
        // Carrousel produits (modèle campagne quand la boutique a des images).
        template_type: i.template_type ?? ('standard' as const),
        carousel_cards: i.carousel_cards ?? null,
        status: 'draft' as const,
      }))

    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from('whatsapp_templates')
        .insert(toInsert)
        .select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // TRADUCTION AUTO (décision produit) : les modèles GARDÉS au swipe
      // partent déclinés dans les autres langues (fr → en). En tâche
      // post-réponse (`after`) pour ne pas bloquer la validation, via le
      // client admin (la session utilisateur n'est pas garantie après la
      // réponse) — translateTemplateRow borne tout par user_id.
      const insertedIds = (inserted || []).map((r) => r.id)
      if (insertedIds.length > 0) {
        const userId = user.id
        after(async () => {
          const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )
          const results = await Promise.allSettled(
            insertedIds.map((id) => translateTemplateRow(admin, userId, id))
          )
          const failed = results.filter((r) => r.status === 'rejected').length
          console.log(`[apply-pack] traductions : ${insertedIds.length - failed}/${insertedIds.length} ok`)
        })
      }
    }
    // On renvoie le nombre TOTAL de modèles validés PRÊTS (nouveaux + déjà
    // présents), pas seulement les nouvellement insérés — sinon un 2e passage
    // (idempotent) afficherait « 0 créés », trompeur. Les brouillons sont
    // conservés même sans WhatsApp : le marchand les retrouve dans /templates.
    templatesCreated = body.templates
      .map((tr) => byTrigger.get(tr))
      .filter((i): i is NonNullable<typeof i> => Boolean(i)).length
  }

  // ── 2. Automatisations validées ───────────────────────────────────────
  if (Array.isArray(body.automations) && body.automations.length > 0) {
    // Modèles du pack déjà en base (pour lier template_id).
    const names = pack.items.map((i) => i.templateName)
    const { data: tpls } = await supabase
      .from('whatsapp_templates')
      .select('id, name')
      .eq('user_id', user.id)
      .in('name', names)
    const tplIdByName = new Map((tpls || []).map((t) => [t.name, t.id]))

    // Automatisations existantes (dédup par trigger + nom du pack).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAutos } = await (supabase as any)
      .from('automations')
      .select('trigger_event, name')
      .eq('user_id', user.id)
    const existingSet = new Set((existingAutos || []).map((a: { trigger_event: string; name: string }) => `${a.trigger_event}|${a.name}`))

    const rows = body.automations
      .map((a) => ({ sel: a, item: byTrigger.get(a.trigger) }))
      .filter((x): x is { sel: { trigger: string; delay_minutes?: number }; item: NonNullable<ReturnType<typeof byTrigger.get>> } => Boolean(x.item))
      .filter((x) => !existingSet.has(`${x.item!.trigger}|${x.item!.automation_name}`))
      .map((x) => {
        const templateId = tplIdByName.get(x.item!.templateName) || null
        const delay = Math.max(0, Math.floor(Number(x.sel.delay_minutes ?? x.item!.delay_minutes) || 0))
        return {
          user_id: user.id,
          name: x.item!.automation_name,
          trigger_event: x.item!.trigger as TriggerEvent,
          trigger_button_text: null,
          template_id: templateId,
          delay_minutes: delay,
          quiet_start: null,
          quiet_end: null,
          timezone: 'Europe/Paris',
          conditions: {},
          is_active: false, // double sécurité : le marchand active lui-même
          folder_id: null,
          graph: defaultGraph(x.item!.trigger as TriggerEvent, templateId),
          builder_mode: true,
          // Range l'automatisation dans le BON onglet (Campagnes vs Transactionnel)
          // selon le trigger. Sans ça, tout tombait en transactionnel par défaut.
          kind: kindForTrigger(x.item!.trigger as TriggerEvent),
        }
      })

    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { error } = await (supabase as any).from('automations').insert(rows)
      // Résilience : si la colonne `kind` n'est pas encore déployée (42703), on
      // rejoue sans elle (les automatisations tomberont en transactionnel par
      // défaut, comportement historique — le déploiement de la colonne corrige).
      if (error && (error.code === '42703' || /kind/.test(error.message || ''))) {
        const rowsNoKind = rows.map(({ kind: _kind, ...rest }) => rest)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;({ error } = await (supabase as any).from('automations').insert(rowsNoKind))
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Nombre TOTAL prêt (déjà présentes + nouvellement créées), comme pour les
    // modèles : au 2e passage (idempotent), « 0 créées » était trompeur alors
    // que tout était bien en place.
    automationsCreated = body.automations.filter((a) => byTrigger.get(a.trigger)).length
  }

  return NextResponse.json({ data: { templatesCreated, automationsCreated } })
}
