import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { metaTemplateContent } from '@/lib/templates/meta-import'

/**
 * POST /api/templates/sync
 * Rafraîchit depuis Meta : statut, catégorie ET CONTENU (corps, boutons, en-tête)
 * des modèles. Meta est la source de vérité — si les boutons ou le texte ont été
 * modifiés côté Meta (ex. ajout d'un bouton), on les rapatrie. On PRÉSERVE en
 * revanche les `variable_keys` locales (mapping Xeyo, inconnu de Meta).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_business_account_id, waba_access_token')
    .eq('user_id', user.id)
    .not('waba_business_account_id', 'is', null)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: { synced: 0 } })
  }

  // Map (name|language) → contenu Meta complet (statut, catégorie, corps, boutons…).
  const metaByKey = new Map<string, ReturnType<typeof metaTemplateContent>>()
  for (const s of sessions) {
    if (!s.waba_business_account_id || !s.waba_access_token) continue
    const token = decryptMessage(s.waba_access_token)
    const res = await wabaClient.listTemplates(s.waba_business_account_id, token)
    if (res.ok) {
      for (const t of res.data.data) {
        metaByKey.set(`${t.name}|${t.language}`, metaTemplateContent(t))
      }
    }
  }

  // Mettre à jour les templates locaux
  const { data: locals } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, status, category, meta_id, body_text, header_text, footer_text, header_type, header_media_url, template_type, carousel_cards, approved_carousel_cards, buttons')
    .eq('user_id', user.id)

  let synced = 0
  for (const tpl of locals || []) {
    const meta = metaByKey.get(`${tpl.name}|${tpl.language}`)
    if (!meta) continue

    const newStatus = meta.status
    const categoryChanged = meta.category && meta.category !== tpl.category
    // Le meta_id stocké peut être OBSOLÈTE (template supprimé/recréé chez Meta) →
    // on le réaligne sur celui réellement renvoyé par Meta.
    const metaIdChanged = meta.meta_id && meta.meta_id !== tpl.meta_id
    // CONTENU : si Meta a un corps, des boutons ou un en-tête différents de ce
    // qu'on a en local, on rapatrie (Meta = vérité). C'est ce qui manquait :
    // un bouton ajouté chez Meta n'apparaissait jamais dans l'app.
    const buttonsChanged = JSON.stringify(meta.buttons ?? null) !== JSON.stringify(tpl.buttons ?? null)
    const bodyChanged = (meta.body_text || '') !== (tpl.body_text || '')
    const headerChanged = (meta.header_text || null) !== (tpl.header_text || null)
      || (meta.header_type || 'none') !== (tpl.header_type || 'none')
    const footerChanged = (meta.footer_text || null) !== (tpl.footer_text || null)
    const contentChanged = buttonsChanged || bodyChanged || headerChanged || footerChanged

    if (newStatus === tpl.status && !categoryChanged && !metaIdChanged && !contentChanged) continue

    const patch: Record<string, unknown> = {
      status: newStatus,
      meta_id: meta.meta_id,
      updated_at: new Date().toISOString(),
    }
    if (categoryChanged) patch.category = meta.category
    if (contentChanged) {
      // On aligne le contenu local sur Meta. `variable_keys` n'est PAS touché
      // (mapping Xeyo, absent de Meta). variables_count est recalculé du corps.
      patch.body_text = meta.body_text
      patch.buttons = meta.buttons
      patch.header_type = meta.header_type
      patch.header_text = meta.header_text
      patch.footer_text = meta.footer_text
      patch.template_type = meta.template_type
      patch.variables_count = meta.variables_count
      // CARROUSEL : Meta ne renvoie JAMAIS les URLs d'images (juste des handles)
      // → parseCards met header_media_url:null. On ne doit donc JAMAIS laisser la
      // synchro écraser une image existante. On récupère l'URL par index depuis,
      // dans l'ordre : les cartes locales actuelles, puis le snapshot approuvé
      // (approved_carousel_cards) comme filet. Le body/boutons viennent de Meta.
      type Card = { header_media_url?: string | null; header_type?: string }
      const metaCards = Array.isArray(meta.carousel_cards) ? meta.carousel_cards as Card[] : null
      const localCards = Array.isArray(tpl.carousel_cards) ? tpl.carousel_cards as Card[] : []
      const apprCards = Array.isArray((tpl as { approved_carousel_cards?: unknown }).approved_carousel_cards)
        ? (tpl as { approved_carousel_cards: Card[] }).approved_carousel_cards : []
      const keepUrl = (i: number, metaUrl?: string | null) =>
        metaUrl || localCards[i]?.header_media_url || apprCards[i]?.header_media_url || null
      patch.carousel_cards = metaCards
        ? metaCards.map((c, i) => ({
            ...c,
            header_media_url: keepUrl(i, c.header_media_url),
            header_type: c.header_type || localCards[i]?.header_type || apprCards[i]?.header_type || 'image',
          }))
        : meta.carousel_cards
    }
    // Header média d'un template STANDARD : Meta ne le renvoie pas → la synchro
    // ne doit pas l'effacer. Le patch ne touche déjà pas header_media_url, donc
    // l'URL locale est conservée telle quelle (rien à faire ici).
    // Refusé : on capture le motif Meta ; sinon on l'efface.
    patch.rejection_reason = newStatus === 'rejected' ? (meta.rejectedReason || null) : null
    // Approuvé → fige la version validée (pour le bouton restaurer). On fige les
    // cartes AVEC leurs images : soit celles qu'on vient de fusionner (patch),
    // soit les cartes locales — jamais celles de Meta (sans images).
    if (newStatus === 'approved') {
      patch.approved_body_text = meta.body_text ?? tpl.body_text
      patch.approved_header_text = meta.header_text ?? tpl.header_text
      patch.approved_footer_text = meta.footer_text ?? tpl.footer_text
      patch.approved_header_type = meta.header_type ?? tpl.header_type
      patch.approved_header_media_url = tpl.header_media_url
      patch.approved_carousel_cards = patch.carousel_cards ?? tpl.carousel_cards
      patch.approved_at = new Date().toISOString()
    }
    await supabase.from('whatsapp_templates').update(patch).eq('id', tpl.id)
    synced++
  }

  return NextResponse.json({ data: { synced } })
}
