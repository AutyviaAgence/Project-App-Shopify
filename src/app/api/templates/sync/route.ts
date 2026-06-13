import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * POST /api/templates/sync
 * Rafraîchit le statut Meta des modèles soumis (pending → approved/rejected).
 * Parcourt les sessions WABA de l'utilisateur et synchronise par nom.
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

  // Construire une map (name|language) → statut + catégorie Meta
  const metaStatus = new Map<string, { status: string; meta_id: string; category: string }>()
  for (const s of sessions) {
    if (!s.waba_business_account_id || !s.waba_access_token) continue
    const token = decryptMessage(s.waba_access_token)
    const res = await wabaClient.listTemplates(s.waba_business_account_id, token)
    if (res.ok) {
      for (const t of res.data.data) {
        metaStatus.set(`${t.name}|${t.language}`, { status: t.status, meta_id: t.id, category: t.category })
      }
    }
  }

  // Mettre à jour les templates locaux
  const { data: locals } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, status, category, meta_id, body_text, header_text, footer_text, header_type, header_media_url, template_type, carousel_cards')
    .eq('user_id', user.id)

  let synced = 0
  for (const tpl of locals || []) {
    const meta = metaStatus.get(`${tpl.name}|${tpl.language}`)
    if (meta) {
      const newStatus = meta.status.toLowerCase() as 'pending' | 'approved' | 'rejected'
      // Meta peut RECLASSER la catégorie d'un template (UTILITY↔MARKETING).
      // On aligne toujours la catégorie locale sur celle de Meta (source de vérité).
      const categoryChanged = meta.category && meta.category !== tpl.category
      // Le meta_id stocké peut être OBSOLÈTE (template supprimé/recréé chez Meta) →
      // on le réaligne sur celui réellement renvoyé par Meta. C'est la cause de
      // l'erreur "déjà du contenu" à l'édition (on éditait un mauvais id).
      const metaIdChanged = meta.meta_id && meta.meta_id !== tpl.meta_id
      if (newStatus !== tpl.status || categoryChanged || metaIdChanged) {
        const patch: Record<string, unknown> = {
          status: newStatus,
          meta_id: meta.meta_id,
          updated_at: new Date().toISOString(),
        }
        if (categoryChanged) patch.category = meta.category
        // Quand un template devient approuvé, on fige son contenu comme
        // "dernière version validée" (pour pouvoir y revenir après édition).
        if (newStatus === 'approved') {
          patch.approved_body_text = tpl.body_text
          patch.approved_header_text = tpl.header_text
          patch.approved_footer_text = tpl.footer_text
          patch.approved_header_type = tpl.header_type
          patch.approved_header_media_url = tpl.header_media_url
          patch.approved_carousel_cards = tpl.carousel_cards
          patch.approved_at = new Date().toISOString()
        }
        await supabase
          .from('whatsapp_templates')
          .update(patch)
          .eq('id', tpl.id)
        synced++
      }
    }
  }

  return NextResponse.json({ data: { synced } })
}
