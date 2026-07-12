import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { metaTemplateContent } from '@/lib/templates/meta-import'
import { persistExternalImage } from '@/lib/storage/media'

// La synchro télécharge et stocke les images des templates approuvés (handles
// Meta temporaires → storage permanent). Plusieurs images → on laisse 60 s.
export const maxDuration = 60

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
    // Normalise avant comparaison : Meta renvoie parfois le corps avec des espaces
    // en fin de ligne ou un \r\n vs \n → sinon bodyChanged serait TOUJOURS vrai et
    // la synchro re-mettrait à jour chaque template à chaque appel.
    const norm = (s?: string | null) => (s || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
    const bodyChanged = norm(meta.body_text) !== norm(tpl.body_text)
    const headerChanged = (meta.header_text || null) !== (tpl.header_text || null)
      || (meta.header_type || 'none') !== (tpl.header_type || 'none')
    const footerChanged = (meta.footer_text || null) !== (tpl.footer_text || null)
    // IMAGES MANQUANTES : une carte de carrousel (ou le header) a perdu son image
    // en local alors que Meta en a une (handle) → il faut re-synchroniser pour la
    // récupérer, même si rien d'autre n'a changé.
    const localCardsChk = Array.isArray(tpl.carousel_cards) ? tpl.carousel_cards as { header_media_url?: string | null }[] : []
    const metaCardsChk = Array.isArray(meta.carousel_cards) ? meta.carousel_cards as { header_media_url?: string | null }[] : []
    const imagesMissing =
      metaCardsChk.some((c, i) => c.header_media_url && !localCardsChk[i]?.header_media_url) ||
      (!!(meta as { header_media_url?: string | null }).header_media_url && !tpl.header_media_url)
    const contentChanged = buttonsChanged || bodyChanged || headerChanged || footerChanged || imagesMissing

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
      if (metaCards) {
        patch.carousel_cards = await Promise.all(metaCards.map(async (c, i) => {
          // On garde en priorité une image locale/approuvée déjà PERMANENTE
          // (chemin storage). Sinon, si Meta renvoie une URL scontent (handle
          // TEMPORAIRE), on la télécharge et la stocke définitivement dans le
          // storage → l'image ne dépend plus d'une URL Meta qui expire.
          const localUrl = localCards[i]?.header_media_url || apprCards[i]?.header_media_url || null
          const isLocalPermanent = localUrl && !/scontent\.whatsapp\.net/.test(localUrl)
          let url = isLocalPermanent ? localUrl : (c.header_media_url || localUrl)
          if (url && /scontent\.whatsapp\.net/.test(url)) {
            const persisted = await persistExternalImage(url, user.id, `${tpl.name}-${tpl.language}-${i}`)
            if (persisted) url = persisted
          }
          return {
            ...c,
            header_media_url: url,
            header_type: c.header_type || localCards[i]?.header_type || apprCards[i]?.header_type || 'image',
          }
        }))
      } else {
        patch.carousel_cards = meta.carousel_cards
      }
    }
    // Header média d'un template STANDARD (image/vidéo/doc) : si Meta renvoie un
    // handle temporaire et qu'on n'a pas déjà une image permanente locale, on la
    // persiste. Sinon on garde l'existant (jamais d'écrasement par null).
    {
      const metaHdr = (meta as { header_media_url?: string | null }).header_media_url
      const localHdr = tpl.header_media_url as string | null
      const localPermanent = localHdr && !/scontent\.whatsapp\.net/.test(localHdr)
      if (!localPermanent && metaHdr && /scontent\.whatsapp\.net/.test(metaHdr)) {
        const persisted = await persistExternalImage(metaHdr, user.id, `${tpl.name}-${tpl.language}-hdr`)
        if (persisted) patch.header_media_url = persisted
      }
    }
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
